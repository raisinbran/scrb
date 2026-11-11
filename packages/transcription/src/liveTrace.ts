import { appendFile, mkdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export const TRACE_STAGES = [
  'trace_start',
  'trace_end',
  'run_start',
  'run_failed',
  'run_stop',
  'frame_enqueue',
  'frame_dequeue',
  'frame_start',
  'frame_end',
  'frame_ack',
  'frame_skip',
  'vad_start',
  'vad_end',
  'vad_error',
  'vad_span',
  'defer',
  'model_start',
  'model_end',
  'model_error',
  'segment_emit',
  'segment_received',
  'segment_delivered',
  'segment_delivery_error',
  'engine_stop',
] as const;
export type TraceStage = (typeof TRACE_STAGES)[number];
export interface TraceFields {
  track?: 'mic' | 'meeting';
  sequence?: number;
  generation?: number;
  workerRun?: number;
  startNs?: number;
  endNs?: number;
  evaluation?: number;
  call?: number;
  spanId?: string;
  parentSpanId?: string;
  segmentKey?: string;
  spanCount?: number;
  wordCount?: number;
  queueMic?: number;
  queueMeeting?: number;
  queueDelayMs?: number;
  bufferedMs?: number;
  more?: boolean;
  flush?: boolean;
  reason?: 'empty' | 'settle' | 'overflow' | 'gap' | 'worker' | 'closed' | 'failed' | 'stopped';
}
export interface TraceRecord extends TraceFields {
  version: 1;
  session: string;
  stream: string;
  role: 'worker' | 'supervisor';
  pid: number;
  serial: number;
  stage: TraceStage;
  monoMs: number;
  anchorWallMs?: number;
  anchorBeforeMs?: number;
  anchorAfterMs?: number;
  dropped?: number;
  ioFailures?: number;
}
export interface LiveTrace {
  record(stage: TraceStage, fields?: TraceFields): void;
  now(): number;
  close(): Promise<void>;
}
interface TraceOptions {
  directory: string;
  session: string;
  role: 'worker' | 'supervisor';
  workerRun?: number;
  maxQueued?: number;
  maxBytes?: number;
  clock?: () => number;
  writeBatch?: (data: string) => Promise<void>;
}
const NUMBER_FIELDS = [
  'sequence',
  'generation',
  'workerRun',
  'startNs',
  'endNs',
  'evaluation',
  'call',
  'spanCount',
  'wordCount',
  'queueMic',
  'queueMeeting',
  'queueDelayMs',
  'bufferedMs',
] as const;
const REASONS = new Set([
  'empty',
  'settle',
  'overflow',
  'gap',
  'worker',
  'closed',
  'failed',
  'stopped',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;

export function spanKey(
  track: 'mic' | 'meeting',
  generation: number,
  startMs: number,
  endMs: number,
): string {
  return `${track}:${generation}:${Math.round(startMs * 1e6)}:${Math.round(endMs * 1e6)}`;
}

/** Allowlisted metadata only. Neither arbitrary errors nor caller strings reach disk. */
function fields(input: TraceFields): TraceFields {
  const clean: TraceFields = {};
  for (const key of NUMBER_FIELDS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) clean[key] = value;
  }
  if (input.track === 'mic' || input.track === 'meeting') clean.track = input.track;
  for (const key of ['more', 'flush'] as const)
    if (typeof input[key] === 'boolean') clean[key] = input[key];
  for (const key of ['spanId', 'parentSpanId'] as const) {
    const value = input[key];
    if (
      typeof value === 'string' &&
      /^(mic|meeting):\d+:\d+:\d+$/.test(value) &&
      value.length <= 100
    )
      clean[key] = value;
  }
  if (
    typeof input.segmentKey === 'string' &&
    /^live-(mic|meeting)-\d+-\d+(?:\.\d+)?$/.test(input.segmentKey) &&
    input.segmentKey.length <= 100
  )
    clean.segmentKey = input.segmentKey;
  if (input.reason && REASONS.has(input.reason)) clean.reason = input.reason;
  return clean;
}

/** Never awaited by capture/inference. Fixed memory/file budgets; no status-channel traffic. */
export class JsonlLiveTrace implements LiveTrace {
  private queue: string[] = [];
  private queuedBytes = 0;
  private bytes = 0;
  private serial = 0;
  private dropped = 0;
  private ioFailures = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | undefined;
  private closing: Promise<void> | undefined;
  private readonly stream = randomUUID();
  private readonly clock: () => number;
  private readonly maxQueued: number;
  private readonly maxBytes: number;
  private readonly writeBatch: (data: string) => Promise<void>;

  constructor(private readonly options: TraceOptions) {
    if (!isAbsolute(options.directory) || !UUID.test(options.session))
      throw new Error('Invalid trace configuration');
    this.clock = options.clock ?? (() => Number(process.hrtime.bigint()) / 1e6);
    this.maxQueued = Math.max(1, Math.min(8192, options.maxQueued ?? 512));
    this.maxBytes = Math.max(4096, Math.min(64 * 1024 * 1024, options.maxBytes ?? 8 * 1024 * 1024));
    const file = join(options.directory, `${options.session}-${options.role}-${this.stream}.jsonl`);
    let created = false;
    this.writeBatch =
      options.writeBatch ??
      (async (data) => {
        if (!created) {
          await mkdir(options.directory, { recursive: true, mode: 0o700 });
          await appendFile(file, data, { flag: 'ax', mode: 0o600 });
          created = true;
        } else await appendFile(file, data);
      });
    const before = this.now(),
      wall = Date.now(),
      after = this.now();
    this.enqueue({
      ...this.base('trace_start'),
      anchorWallMs: wall,
      anchorBeforeMs: before,
      anchorAfterMs: after,
    });
  }

  now(): number {
    return this.clock();
  }

  record(stage: TraceStage, input: TraceFields = {}): void {
    try {
      if (this.closed || !TRACE_STAGES.includes(stage)) return;
      this.enqueue({ ...this.base(stage), ...fields(input) });
    } catch {
      this.dropped += 1;
    }
  }

  private base(stage: TraceStage): TraceRecord {
    return {
      version: 1,
      session: this.options.session,
      stream: this.stream,
      role: this.options.role,
      pid: process.pid,
      workerRun: this.options.workerRun ?? 0,
      serial: this.serial++,
      stage,
      monoMs: this.now(),
    };
  }

  private enqueue(record: TraceRecord): void {
    const line = JSON.stringify(record) + '\n',
      size = Buffer.byteLength(line);
    // Reserve space for the final completeness record, even after file saturation.
    if (
      this.queue.length >= this.maxQueued ||
      this.bytes + this.queuedBytes + size > this.maxBytes - 2048
    ) {
      this.dropped += 1;
      return;
    }
    this.queue.push(line);
    this.queuedBytes += size;
    if (!this.timer && !this.writing) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.drain();
      }, 20);
      this.timer.unref();
    }
  }

  private drain(): Promise<void> {
    if (this.writing) return this.writing;
    this.writing = (async () => {
      while (this.queue.length) {
        const batch = this.queue.splice(0, 64).join('');
        const bytes = Buffer.byteLength(batch);
        this.queuedBytes -= bytes;
        this.bytes += bytes;
        try {
          await this.writeBatch(batch);
        } catch {
          this.ioFailures += 1;
          this.dropped += batch.split('\n').length - 1;
        }
      }
    })().finally(() => {
      this.writing = undefined;
      if (this.queue.length && !this.closed) {
        this.timer = setTimeout(() => {
          this.timer = undefined;
          void this.drain();
        }, 20);
        this.timer.unref();
      }
    });
    return this.writing;
  }

  close(): Promise<void> {
    this.closing ??= (async () => {
      this.closed = true;
      clearTimeout(this.timer);
      this.timer = undefined;
      await this.drain();
      const footer = {
        ...this.base('trace_end'),
        dropped: this.dropped,
        ioFailures: this.ioFailures,
      };
      try {
        await this.writeBatch(JSON.stringify(footer) + '\n');
      } catch {
        this.ioFailures += 1;
      }
    })().catch(() => undefined);
    return this.closing;
  }
}

export function openLiveTrace(
  directory: string | undefined,
  session: string,
  role: 'worker' | 'supervisor',
  workerRun = 0,
): LiveTrace | undefined {
  if (!directory) return undefined;
  try {
    return new JsonlLiveTrace({ directory, session, role, workerRun });
  } catch {
    return undefined;
  }
}
