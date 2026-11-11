import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelPaths, ToolPaths } from './config.js';
import { encodePcmFrame, pcmEndNs, validPcmFrame, type LivePcmFrame } from './livePcmProtocol.js';
import type { LiveSkip, LiveTrackStats, TimedLiveSegment } from './livePcmEngine.js';
import type { TrackKind } from './types.js';
import { detectSpeech, LiveWhisper, type LiveWhisperOptions, type VadSpan } from './whisper.js';
import { WorkerProcess } from './worker.js';
import { openLiveTrace, type LiveTrace, type TraceFields } from './liveTrace.js';

export type LiveAudioEvent =
  | { type: 'segment'; segment: TimedLiveSegment }
  | { type: 'skipped'; gap: LiveSkip }
  | { type: 'lag'; queuedFrames: number; lagMs: number }
  | { type: 'restarting'; attempt: number }
  | { type: 'failed'; reason: 'worker-unavailable' | 'status-overflow' | 'cleanup-failed' };

export interface LiveModelHost {
  port: number;
  pid?: number;
  detect(track: TrackKind, signal: AbortSignal): Promise<VadSpan[]>;
  close(): Promise<void>;
  exited?: Promise<unknown>;
}

export interface LiveAudioWorkerOptions {
  tools: ToolPaths;
  models: ModelPaths;
  whisper?: Pick<LiveWhisperOptions, 'threads' | 'useGpu' | 'audioContext' | 'language'>;
  onEvent: (event: LiveAudioEvent) => void;
  maxQueuedFrames?: number;
  requestTimeoutMs?: number;
  startTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  /** Defaults to the compiled package entry; tests may launch an invented worker. */
  workerArgs?: string[];
  tempRoot?: string;
  startModels?: (workDir: string, signal: AbortSignal) => Promise<LiveModelHost>;
  /** Opt-in, private diagnostic JSONL outside automatically removed scratch. */
  traceDirectory?: string;
}

const STAT_FIELDS = [
  'vadCalls',
  'vadEmpty',
  'spans',
  'modelCalls',
  'modelEmpty',
  'samples',
  'rms',
  'peak',
  'bridgedGaps',
  'resetGaps',
  'gapMs',
  'lostFrames',
  'slowestHopMs',
] as const;

/** Copies known numbers only, so nothing else from the worker can reach a log. */
/** Ten seconds per track, longer than the slowest model calls seen in a real call (4.9 s). */
const DEFAULT_QUEUED_FRAMES = 100;

function flatStats(raw: unknown): Record<string, number> {
  const stats: Record<string, number> = {};
  for (const track of ['mic', 'meeting'] as const) {
    const row = (raw as Partial<Record<TrackKind, LiveTrackStats>> | null | undefined)?.[track];
    if (!row) continue;
    for (const field of STAT_FIELDS) {
      if (!Number.isFinite(row[field])) throw new Error('Invalid live stats');
      stats[`${track}.${field}`] = row[field];
    }
  }
  return stats;
}

interface Run {
  id: number;
  abort: AbortController;
  ready: boolean;
  failed: boolean;
  workDir: string;
  lastAckAtMs?: number;
  lastSegmentAtMs?: number;
  stats?: Record<string, number>;
  statsAtMs?: number;
  segments?: Map<string, TimedLiveSegment>;
  pending: Map<TrackKind, { startNs: number; endNs: number }>;
  worker?: WorkerProcess;
  models?: LiveModelHost;
  frame?: LivePcmFrame;
  timer?: ReturnType<typeof setTimeout>;
  startup?: Promise<void>;
  vad?: Promise<void>;
  cleanup?: Promise<void>;
  modelCleanup?: Promise<void>;
}

/** Owns only live processes and its own scratch directory, never a recording path or lock. */
export class LiveAudioWorker {
  /** Totals since start, one per stage: lost before arrival, refused, dropped from the queue, sent on. */
  private readonly inputLostFrames: Record<TrackKind, number> = { mic: 0, meeting: 0 };
  private readonly rejectedFrames: Record<TrackKind, number> = { mic: 0, meeting: 0 };
  private readonly overflowFrames: Record<TrackKind, number> = { mic: 0, meeting: 0 };
  private readonly sentFrames: Record<TrackKind, number> = { mic: 0, meeting: 0 };
  private readonly queues = new Map<TrackKind, LivePcmFrame[]>([
    ['mic', []],
    ['meeting', []],
  ]);
  private readonly accepted = new Map<
    TrackKind,
    { sequence: number; endNs: number; generation: number; boundary: boolean }
  >();
  private run: Run | undefined;
  private restarts = 0;
  private closed = false;
  private nextRun = 0;
  private closing: Promise<void> | undefined;
  private readonly capacity: number;
  private readonly namespace = randomUUID();
  private notifications: LiveAudioEvent[] = [];
  private notificationScheduled = false;
  private notificationOverflow = false;
  private readonly trace: LiveTrace | undefined;
  private readonly queuedAt: WeakMap<LivePcmFrame, number> | undefined;

  private constructor(
    private readonly options: LiveAudioWorkerOptions,
    private readonly scratch: string,
  ) {
    this.capacity = options.maxQueuedFrames ?? DEFAULT_QUEUED_FRAMES;
    this.trace = openLiveTrace(
      options.traceDirectory ?? process.env['SCRB_LIVE_TRACE_DIR'],
      this.namespace,
      'supervisor',
    );
    this.queuedAt = this.trace ? new WeakMap() : undefined;
  }

  static async start(options: LiveAudioWorkerOptions): Promise<LiveAudioWorker> {
    const capacity = options.maxQueuedFrames ?? DEFAULT_QUEUED_FRAMES;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 128)
      throw new RangeError('Invalid live queue capacity');
    for (const timeout of [
      options.requestTimeoutMs ?? 30_000,
      options.startTimeoutMs ?? 60_000,
      options.cleanupTimeoutMs ?? 1000,
    ]) {
      if (!Number.isFinite(timeout) || timeout < 1 || timeout > 60_000)
        throw new RangeError('Invalid live timeout');
    }
    const scratch = await mkdtemp(join(options.tempRoot ?? tmpdir(), 'scrb-live-pcm-'));
    const worker = new LiveAudioWorker(options, scratch);
    worker.launch();
    return worker;
  }

  /** Bounded copy and enqueue only. Failure, overload and observer errors never escape to capture. */
  offer(frame: LivePcmFrame): boolean {
    try {
      if (this.closed || !validPcmFrame(frame)) return false;
      const last = this.accepted.get(frame.track);
      if (
        last &&
        (frame.sequence <= last.sequence ||
          frame.startNs < last.endNs ||
          frame.generation < last.generation ||
          (last.boundary && !frame.boundary && frame.generation === last.generation))
      ) {
        this.rejectedFrames[frame.track] += 1;
        return false;
      }
      if (last && frame.generation === last.generation)
        this.inputLostFrames[frame.track] += frame.sequence - last.sequence - 1;
      const copy = { ...frame, samples: frame.samples.slice() };
      const queue = this.queues.get(frame.track)!;
      this.accepted.set(frame.track, {
        sequence: frame.sequence,
        endNs: pcmEndNs(frame),
        generation: frame.generation,
        boundary: frame.boundary,
      });
      if (queue.length === this.capacity) {
        this.skip(queue.shift()!, 'overflow');
        this.overflowFrames[frame.track] += 1;
      }
      if (this.closed) return false;
      queue.push(copy);
      if (this.trace) {
        this.queuedAt!.set(copy, this.trace.now());
        this.trace.record('frame_enqueue', this.traceFrame(copy));
      }
      this.lag();
      this.pump();
      return true;
    } catch {
      return false;
    }
  }

  getProgress(): {
    workerPid: number | null;
    modelPid: number | null;
    ready: boolean;
    queuedFrames: number;
    lastAckAtMs: number | null;
    lastSegmentAtMs: number | null;
    stats: Record<string, number>;
    statsAtMs: number | null;
  } {
    const run = this.run;
    return {
      workerPid: run?.worker?.pid ?? null,
      modelPid: run?.models?.pid ?? null,
      ready: run?.ready ?? false,
      queuedFrames: [...this.queues.values()].reduce((count, queue) => count + queue.length, 0),
      lastAckAtMs: run?.lastAckAtMs ?? null,
      lastSegmentAtMs: run?.lastSegmentAtMs ?? null,
      stats: {
        ...run?.stats,
        'mic.inputLostFrames': this.inputLostFrames.mic,
        'meeting.inputLostFrames': this.inputLostFrames.meeting,
        'mic.rejectedFrames': this.rejectedFrames.mic,
        'meeting.rejectedFrames': this.rejectedFrames.meeting,
        'mic.overflowFrames': this.overflowFrames.mic,
        'meeting.overflowFrames': this.overflowFrames.meeting,
        'mic.sentFrames': this.sentFrames.mic,
        'meeting.sentFrames': this.sentFrames.meeting,
      },
      statsAtMs: run?.statsAtMs ?? null,
    };
  }

  /** Stop discards provisional tails. The independent final pass owns complete transcription. */
  close(): Promise<void> {
    this.closing ??= this.stop().catch(() => {
      this.notifications.push({ type: 'failed', reason: 'cleanup-failed' });
      this.scheduleNotifications();
    });
    return this.closing;
  }

  private async stop(): Promise<void> {
    this.closed = true;
    for (const queue of this.queues.values()) {
      for (const frame of queue) this.skip(frame, 'closed');
      queue.length = 0;
    }
    try {
      if (this.run) await this.cleanup(this.run);
    } finally {
      this.accepted.clear();
      await rm(this.scratch, { recursive: true, force: true });
      this.trace?.record('run_stop', { workerRun: this.run?.id ?? 0, reason: 'stopped' });
      void this.trace?.close();
    }
  }

  private emit(event: LiveAudioEvent): void {
    if (this.notificationOverflow) return;
    const previous = this.notifications.findLastIndex((e) =>
      event.type === 'lag'
        ? e.type === 'lag'
        : event.type === 'skipped' &&
          e.type === 'skipped' &&
          e.gap.track === event.gap.track &&
          e.gap.reason === event.gap.reason &&
          e.gap.endMs >= event.gap.startMs,
    );
    if (previous >= 0) {
      const old = this.notifications[previous]!;
      if (old.type === 'skipped' && event.type === 'skipped') {
        event = {
          type: 'skipped',
          gap: {
            ...event.gap,
            startMs: Math.min(old.gap.startMs, event.gap.startMs),
            endMs: Math.max(old.gap.endMs, event.gap.endMs),
          },
        };
      }
      this.notifications.splice(previous, 1);
      this.notifications.push(event);
    } else if (this.notifications.length < 64) this.notifications.push(event);
    else {
      this.notificationOverflow = true;
      this.notifications = [{ type: 'failed', reason: 'status-overflow' }];
      if (!this.closed) void this.close();
    }
    this.scheduleNotifications();
  }

  private scheduleNotifications(): void {
    if (this.notificationScheduled) return;
    this.notificationScheduled = true;
    queueMicrotask(() => {
      this.notificationScheduled = false;
      const notifications = this.notifications;
      this.notifications = [];
      for (const notification of notifications) {
        if (this.closed && notification.type === 'segment') continue;
        try {
          this.options.onEvent(notification);
          if (notification.type === 'segment')
            this.trace?.record('segment_delivered', {
              track: notification.segment.track,
              workerRun: this.run?.id ?? 0,
              sequence: notification.segment.sequence,
              segmentKey: notification.segment.id.replace(`${this.namespace}-${this.run?.id}-`, ''),
              wordCount: notification.segment.words.length,
            });
        } catch {
          if (notification.type === 'segment')
            this.trace?.record('segment_delivery_error', {
              workerRun: this.run?.id ?? 0,
              track: notification.segment.track,
              reason: 'failed',
            });
          /* Observers cannot fail recording. */
        }
      }
    });
  }

  private skip(frame: LivePcmFrame, reason: LiveSkip['reason']): void {
    this.trace?.record('frame_skip', { ...this.traceFrame(frame), reason });
    this.emit({
      type: 'skipped',
      gap: {
        track: frame.track,
        startMs: frame.startNs / 1e6,
        endMs: pcmEndNs(frame) / 1e6,
        reason,
      },
    });
  }

  private lag(): void {
    const frames = [...this.queues.values()].flat();
    if (this.run?.frame) frames.push(this.run.frame);
    const spans = frames.map((frame) => ({ startNs: frame.startNs, endNs: pcmEndNs(frame) }));
    for (const pending of this.run?.pending.values() ?? []) {
      if (pending.endNs > pending.startNs) spans.push(pending);
    }
    this.emit({
      type: 'lag',
      queuedFrames: frames.length,
      lagMs: spans.length
        ? (Math.max(...spans.map((s) => s.endNs)) - Math.min(...spans.map((s) => s.startNs))) / 1e6
        : 0,
    });
  }

  private launch(): void {
    if (this.closed) return;
    const run: Run = {
      id: this.nextRun++,
      abort: new AbortController(),
      ready: false,
      failed: false,
      workDir: join(this.scratch, `worker-${this.nextRun}`),
      pending: new Map(),
    };
    this.run = run;
    this.trace?.record('run_start', { workerRun: run.id });
    run.timer = setTimeout(() => this.fail(run), this.options.startTimeoutMs ?? 60_000);
    run.startup = this.startRun(run);
  }

  private async startRun(run: Run): Promise<void> {
    try {
      await mkdir(run.workDir);
      const models = await (this.options.startModels ?? this.startModels.bind(this))(
        run.workDir,
        run.abort.signal,
      );
      run.models = models;
      if (run.abort.signal.aborted || this.closed) {
        await this.closeModels(run);
        return;
      }
      const worker = new WorkerProcess({
        name: 'live-pcm',
        command: process.execPath,
        args: this.options.workerArgs ?? [
          fileURLToPath(new URL('./liveWorkerEntry.js', import.meta.url)),
        ],
        stdin: true,
        ipc: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          ...(this.trace
            ? {
                SCRB_LIVE_TRACE_DIR:
                  this.options.traceDirectory ?? process.env['SCRB_LIVE_TRACE_DIR'],
                SCRB_LIVE_TRACE_SESSION: this.namespace,
                SCRB_LIVE_TRACE_RUN: String(run.id),
              }
            : {
                SCRB_LIVE_TRACE_DIR: '',
                SCRB_LIVE_TRACE_SESSION: '',
                SCRB_LIVE_TRACE_RUN: '',
              }),
        },
      });
      run.worker = worker;
      // No model stdout/stderr, PCM or transcript text is copied into application logs.
      worker.stdout.resume();
      worker.stdin.on('error', () => this.fail(run));
      worker.onMessage((message) => this.message(run, message));
      void worker.done.then(() => this.fail(run));
      void models.exited?.then(
        () => this.fail(run),
        () => this.fail(run),
      );
      worker.send({
        type: 'init',
        workDir: run.workDir,
        port: models.port,
        tools: this.options.tools,
        models: this.options.models,
      });
    } catch {
      this.fail(run);
    }
  }

  private async startModels(workDir: string, signal: AbortSignal): Promise<LiveModelHost> {
    const model = await LiveWhisper.start(this.options.tools, {
      ...this.options.whisper,
      model: this.options.models.speechLive,
      signal,
      startTimeoutMs: this.options.startTimeoutMs ?? 60_000,
    });
    return {
      port: model.portNumber,
      ...(model.pid === undefined ? {} : { pid: model.pid }),
      exited: model.exited,
      detect: (track, stop) =>
        detectSpeech(
          this.options.tools,
          this.options.models.vad,
          join(workDir, `vad-${track}.wav`),
          stop,
          64 * 1024,
        ),
      close: async () => {
        model.kill();
        await model.exited;
      },
    };
  }

  private message(run: Run, raw: unknown): void {
    if (this.closed || run !== this.run || run.failed) return;
    try {
      if (!raw || typeof raw !== 'object') throw new Error('Invalid live reply');
      const message = raw as Record<string, unknown>;
      if (message.type === 'ready' && !run.ready) {
        run.ready = true;
        clearTimeout(run.timer);
        this.pump();
      } else if (
        message.type === 'ack' &&
        run.frame &&
        message.track === run.frame.track &&
        message.sequence === run.frame.sequence
      ) {
        const start = message.bufferedStartNs;
        if (
          !Number.isSafeInteger(start) ||
          Number(start) < (run.pending.get(run.frame.track)?.startNs ?? 0) ||
          Number(start) > pcmEndNs(run.frame)
        )
          throw new Error('Invalid live buffer timing');
        run.pending.set(run.frame.track, { startNs: Number(start), endNs: pcmEndNs(run.frame) });
        run.lastAckAtMs = Date.now();
        this.trace?.record('frame_ack', this.traceFrame(run.frame));
        clearTimeout(run.timer);
        delete run.frame;
        this.lag();
        this.pump();
      } else if (
        message.type === 'vad' &&
        run.frame &&
        message.track === run.frame.track &&
        !run.vad
      ) {
        const track = run.frame.track;
        run.vad = run
          .models!.detect(track, run.abort.signal)
          .then((spans) => {
            if (!run.failed && !this.closed) run.worker!.send({ type: 'vad', spans });
          })
          .catch(() => this.fail(run))
          .finally(() => {
            delete run.vad;
          });
      } else if (message.type === 'attribution' || (message.type === 'segment' && run.frame)) {
        const segment = message.segment as TimedLiveSegment;
        const original =
          message.type === 'attribution' ? run.segments?.get(segment?.id) : undefined;
        if (
          message.type === 'attribution' &&
          (!original ||
            original.generation !== segment.generation ||
            segment.generation !== this.accepted.get('meeting')?.generation ||
            this.accepted.get('meeting')?.boundary ||
            original.track !== segment.track ||
            original.sequence !== segment.sequence ||
            original.startMs !== segment.startMs ||
            original.endMs !== segment.endMs ||
            JSON.stringify(original.words) !== JSON.stringify(segment.words))
        )
          return;
        if (
          !segment ||
          (!original &&
            (segment.track !== run.frame!.track || segment.sequence !== run.frame!.sequence)) ||
          typeof segment.id !== 'string' ||
          segment.id.length > 128 ||
          segment.provisional !== true ||
          !Array.isArray(segment.words) ||
          !segment.words.length ||
          segment.words.length > 256 ||
          typeof segment.text !== 'string' ||
          segment.text.length > 8192 ||
          !Number.isFinite(segment.startMs) ||
          !Number.isFinite(segment.endMs) ||
          segment.startMs < 0 ||
          segment.endMs < segment.startMs ||
          (!original && segment.endMs > pcmEndNs(run.frame!) / 1e6)
        )
          throw new Error('Invalid live segment');
        let end = segment.startMs;
        for (const word of segment.words) {
          if (
            typeof word.text !== 'string' ||
            !word.text.trim() ||
            word.text.length > 256 ||
            ![word.startMs, word.endMs, word.confidence].every(Number.isFinite) ||
            word.startMs < end ||
            word.endMs < word.startMs ||
            word.endMs > segment.endMs ||
            word.confidence < 0 ||
            word.confidence > 1
          )
            throw new Error('Invalid live word');
          end = word.endMs;
        }
        if (
          segment.wordSpeakers !== undefined &&
          (!Array.isArray(segment.wordSpeakers) ||
            segment.track !== 'meeting' ||
            segment.wordSpeakers.length !== segment.words.length ||
            segment.wordSpeakers.some(
              (s) =>
                !s ||
                !/^(meeting|live-[1-9][0-9]{0,8})$/.test(s.id) ||
                !(s.id === 'meeting'
                  ? s.label === 'Meeting'
                  : /^(Speaker \?|Speaker [1-9][0-9]{0,8})$/.test(s.label)),
            ))
        )
          throw new Error('Invalid live attribution');
        if (!original) {
          run.segments ??= new Map();
          run.segments.set(segment.id, segment);
          if (run.segments.size > 64) run.segments.delete(run.segments.keys().next().value!);
        }
        run.lastSegmentAtMs = Date.now();
        this.trace?.record('segment_received', {
          ...(run.frame ? this.traceFrame(run.frame) : {}),
          segmentKey: segment.id,
          wordCount: segment.words.length,
        });
        this.emit({
          type: 'segment',
          segment: {
            id: `${this.namespace}-${run.id}-${segment.id}`,
            track: segment.track,
            sequence: segment.sequence,
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.words.map((w) => w.text).join(' '),
            words: segment.words.map((w) => ({
              text: w.text,
              startMs: w.startMs,
              endMs: w.endMs,
              confidence: w.confidence,
            })),
            ...(segment.wordSpeakers
              ? {
                  wordSpeakers: segment.wordSpeakers.map((s) => ({
                    id: s.id === 'meeting' ? s.id : `${this.namespace}-${run.id}-${s.id}`,
                    label: s.label,
                  })),
                }
              : {}),
            speakerId: segment.track === 'mic' ? 'you' : 'meeting',
            speakerLabel: segment.track === 'mic' ? 'You' : 'Meeting',
            provisional: true,
          },
        });
      } else if (message.type === 'stats') {
        run.stats = flatStats(message.stats);
        run.statsAtMs = Date.now();
      } else if (message.type === 'skipped' && run.frame) {
        const gap = message.gap as LiveSkip;
        if (
          !gap ||
          gap.track !== run.frame.track ||
          !Number.isFinite(gap.startMs) ||
          !Number.isFinite(gap.endMs) ||
          gap.startMs < 0 ||
          gap.endMs < gap.startMs ||
          gap.endMs > pcmEndNs(run.frame) / 1e6
        )
          throw new Error('Invalid live gap');
        this.emit({
          type: 'skipped',
          gap: { track: gap.track, startMs: gap.startMs, endMs: gap.endMs, reason: 'gap' },
        });
      } else throw new Error('Unexpected live reply');
    } catch {
      // Optional speaker metadata must not restart the worker delivering transcript words.
      if (raw && typeof raw === 'object' && (raw as Record<string, unknown>).type === 'attribution')
        return;
      this.fail(run);
    }
  }

  private pump(): void {
    const run = this.run;
    if (!run?.ready || run.failed || run.frame || this.closed) return;
    const candidates = [...this.queues.values()].filter((q) => q.length);
    candidates.sort((a, b) => a[0]!.startNs - b[0]!.startNs);
    const next = candidates[0]?.shift();
    if (!next) return;
    const frame = { ...next, more: candidates[0]!.length > 0 };
    run.frame = frame;
    if (this.trace)
      this.trace.record('frame_dequeue', {
        ...this.traceFrame(frame),
        queueDelayMs: Math.max(
          0,
          this.trace.now() - (this.queuedAt?.get(next) ?? this.trace.now()),
        ),
      });
    this.sentFrames[frame.track] += 1;
    run.pending.set(frame.track, {
      startNs: Math.min(frame.startNs, run.pending.get(frame.track)?.startNs ?? frame.startNs),
      endNs: pcmEndNs(frame),
    });
    run.timer = setTimeout(() => this.fail(run), this.options.requestTimeoutMs ?? 30_000);
    run.worker!.stdin.write(encodePcmFrame(frame));
  }

  private cleanup(run: Run): Promise<void> {
    run.cleanup ??= (async () => {
      run.abort.abort();
      clearTimeout(run.timer);
      run.worker?.kill();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          (async () => {
            await run.startup;
            const results = await Promise.allSettled([
              run.worker?.done,
              this.closeModels(run),
              run.vad,
            ]);
            if (results.some((result) => result.status === 'rejected'))
              throw new Error('Live cleanup failed');
          })(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(
              () => reject(new Error('Live cleanup timed out')),
              this.options.cleanupTimeoutMs ?? 1000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    })();
    return run.cleanup;
  }

  private closeModels(run: Run): Promise<void> {
    if (!run.models) return Promise.resolve();
    run.modelCleanup ??= Promise.resolve().then(() => run.models!.close());
    return run.modelCleanup;
  }

  private fail(run: Run): void {
    if (this.closed || run !== this.run || run.failed) return;
    run.failed = true;
    this.trace?.record('run_failed', { workerRun: run.id, reason: 'failed' });
    for (const [track, pending] of run.pending)
      if (pending.endNs > pending.startNs) {
        this.emit({
          type: 'skipped',
          gap: {
            track,
            startMs: pending.startNs / 1e6,
            endMs: pending.endNs / 1e6,
            reason: 'worker',
          },
        });
      }
    run.pending.clear();
    delete run.frame;
    void this.cleanup(run).then(
      () => {
        if (this.closed) return;
        if (++this.restarts > 3) {
          this.emit({ type: 'failed', reason: 'worker-unavailable' });
          void this.close();
        } else {
          this.emit({ type: 'restarting', attempt: this.restarts });
          this.launch();
        }
      },
      () => {
        void this.close();
      },
    );
  }

  private traceFrame(frame: LivePcmFrame): TraceFields {
    return {
      track: frame.track,
      sequence: frame.sequence,
      generation: frame.generation,
      workerRun: this.run?.id ?? 0,
      startNs: frame.startNs,
      endNs: pcmEndNs(frame),
      more: frame.more === true,
      queueMic: this.queues.get('mic')!.length,
      queueMeeting: this.queues.get('meeting')!.length,
    };
  }
}
