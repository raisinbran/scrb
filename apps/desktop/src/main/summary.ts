import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  guardSummaryLinks,
  toGeneratedSummary,
  type GeneratedSummary,
  type LargeModelGate,
} from '@scrb/app-core';
import { ContractError, type BackendEvents, type EventName } from '@scrb/contracts';
import { errorFields, StaleRevisionError, type Library } from '@scrb/storage';
import type { Extraction, LlmClient, MeetingSummary, Transcript } from '@scrb/summary';
import type { CallHandlers } from './dispatch.ts';
import { readSummaryState, requireMeeting, toEngineTranscript } from './meetings.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

export interface SummaryPaths {
  serverPath: string;
  modelPath: string;
}

/** A model server the engine talks to: one process for one job. */
export interface ModelServer extends LlmClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  readonly pid: number | undefined;
}

/** The summary engine, injected so tests need no model and the app wires the real one. */
export interface SummaryEngine {
  server(paths: SummaryPaths, options: { contextTokens?: number }): ModelServer;
  extractItems(
    transcript: Transcript,
    llm: LlmClient,
    options: {
      signal?: AbortSignal;
      onProgress?: (done: number, total: number, sections: number) => void;
    },
  ): Promise<Extraction>;
  writeSummary(
    extraction: Extraction,
    llm: LlmClient,
    length: 'brief' | 'full',
    options: { signal?: AbortSignal },
  ): Promise<MeetingSummary>;
}

export interface SummaryDeps {
  library: Library;
  emit: Emit;
  gate: LargeModelGate;
  engine: SummaryEngine;
  /** True while a recording is active or starting or stopping. Recording always wins. */
  recordingActive: () => boolean;
  /** Reads the tool and model paths, or throws a `SummaryUnavailableError`. */
  readPaths: () => Promise<SummaryPaths>;
  /** Where the running server's process id is kept, so a crash cannot leave it behind. */
  pidFile?: string;
  now?: () => Date;
}

export class SummaryUnavailableError extends Error {}

type StopReason = 'cancelled' | 'recording' | 'deleted' | 'shutdown';

const STOP_MESSAGES: Record<StopReason, string | null> = {
  cancelled: 'Summary cancelled.',
  recording: 'Summary stopped because a recording started. Run it again after.',
  deleted: null,
  shutdown: null,
};
const STALE_MESSAGE = 'The transcript changed while the summary ran. Run it again.';
const FAILED_MESSAGE = 'The summary could not be generated. Your audio and transcript are safe.';
/** First pass and coverage pass take this share of the bar; the two writing steps take the rest. */
const EXTRACTION_SHARE = 0.7;
const SMALL_CONTEXT = 16384;
const OUT_OF_MEMORY = /out of memory|failed to allocate|cudaMalloc|insufficient memory/i;

const execFileAsync = promisify(execFile);

interface ServerRecord {
  pid: number;
  startedAt: string;
  serverPath: string;
}

async function processField(pid: number, field: 'lstart' | 'command'): Promise<string | null> {
  const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', `${field}=`], {
    env: { ...process.env, LC_ALL: 'C' },
  });
  return stdout.trim() || null;
}

/** Both tools and the model must exist; the message says which is missing. */
export async function readSummaryPaths(configPath: string | undefined): Promise<SummaryPaths> {
  const setup = 'Summaries need the model and llama.cpp set up.';
  if (!configPath) throw new SummaryUnavailableError(`${setup} No setup file is configured.`);
  let config: { tools?: Record<string, string>; models?: Record<string, string> };
  try {
    config = JSON.parse(await readFile(configPath, 'utf8')) as typeof config;
  } catch {
    throw new SummaryUnavailableError(`${setup} The setup file could not be read.`);
  }
  const serverPath = config.tools?.['llamaServer'];
  const modelPath = config.models?.['summary'];
  const missing = [
    ...(serverPath && existsSync(serverPath) ? [] : ['the llama.cpp server']),
    ...(modelPath && existsSync(modelPath) ? [] : ['the summary model']),
  ];
  if (!serverPath || !modelPath || missing.length > 0) {
    throw new SummaryUnavailableError(
      `${setup} Missing: ${missing.join(' and ')}. Your audio and transcript are safe.`,
    );
  }
  return { serverPath, modelPath };
}

interface Run {
  abort: AbortController;
  reason: StopReason | null;
  done: Promise<void>;
}

/**
 * Runs one summary at a time per meeting, through the large-model gate. Recording always wins:
 * a recording that starts aborts the run and stops the server. Nothing is saved unless the run
 * finished against the transcript it read.
 */
export class SummaryController {
  private readonly runs = new Map<string, Run>();

  constructor(private readonly deps: SummaryDeps) {}

  isRunning(meetingId: string): boolean {
    return this.runs.has(meetingId);
  }

  /** Call when a recording is about to start or has started. Does not wait. */
  recordingStarted(): void {
    for (const run of this.runs.values()) this.stop(run, 'recording');
  }

  /** Stops one meeting's run and waits for the server to exit. */
  async stopAndWait(meetingId: string, reason: StopReason): Promise<void> {
    const run = this.runs.get(meetingId);
    if (!run) return;
    this.stop(run, reason);
    await run.done;
  }

  /** Quit: every server is stopped before the app goes. */
  async shutdown(): Promise<void> {
    const all = [...this.runs.values()];
    for (const run of all) this.stop(run, 'shutdown');
    await Promise.all(all.map((run) => run.done));
  }

  /**
   * At startup: a server left by a crash holds about 8 GB, so it is stopped. The record holds the
   * process's start time and our server path, and both must match: a recycled process id, even
   * of another `llama-server`, is left alone.
   */
  async stopStaleServer(): Promise<void> {
    const { pidFile } = this.deps;
    if (!pidFile || process.platform === 'win32') return;
    try {
      const record = JSON.parse(await readFile(pidFile, 'utf8')) as ServerRecord;
      const [startedAt, command] = await Promise.all([
        processField(record.pid, 'lstart'),
        processField(record.pid, 'command'),
      ]);
      if (
        Number.isInteger(record.pid) &&
        record.pid > 1 &&
        startedAt !== null &&
        startedAt === record.startedAt &&
        command?.includes(record.serverPath)
      ) {
        process.kill(record.pid, 'SIGKILL');
      }
    } catch {
      // No file, an old-format file, no such process or no ps: nothing safe to stop.
    }
    await rm(pidFile, { force: true });
  }

  get handlers(): CallHandlers {
    return {
      generateSummary: async (request) => {
        const { meetingId } = request as { meetingId: string };
        await this.start(meetingId);
      },
      cancelSummary: async (request) => {
        const { meetingId } = request as { meetingId: string };
        await requireMeeting(this.deps.library, meetingId);
        await this.stopAndWait(meetingId, 'cancelled');
      },
    };
  }

  private stop(run: Run, reason: StopReason): void {
    if (run.reason === null) run.reason = reason;
    run.abort.abort();
  }

  private async start(meetingId: string): Promise<void> {
    const { library, recordingActive } = this.deps;
    const meeting = await requireMeeting(library, meetingId);
    if (this.runs.has(meetingId)) return;
    if (recordingActive()) {
      throw new ContractError({
        code: 'conflict',
        message: 'A summary cannot start while a recording is active.',
      });
    }
    if (meeting.status !== 'ready') {
      throw new ContractError({
        code: 'conflict',
        message: 'The summary can be made once the transcript is final.',
      });
    }
    const abort = new AbortController();
    const run: Run = { abort, reason: null, done: Promise.resolve() };
    this.runs.set(meetingId, run);
    run.done = this.execute(meetingId, run).finally(() => this.runs.delete(meetingId));
    this.changed(meetingId);
  }

  private progress(
    meetingId: string,
    stage: BackendEvents['summaryProgress']['stage'],
    fraction: number,
    message?: string,
  ): void {
    this.deps.emit('summaryProgress', {
      meetingId,
      stage,
      fraction,
      ...(message === undefined ? {} : { message }),
    });
  }

  /** Tells the list the state changed. Never throws: a deleted meeting has no row to update. */
  private changed(meetingId: string): void {
    void (async () => {
      try {
        const meeting = await this.deps.library.getMeeting(meetingId);
        this.deps.emit('meetingChanged', {
          id: meeting.id,
          title: meeting.title,
          startedAt: meeting.date,
          durationMs: meeting.durationMs,
          origin: meeting.source,
          status: meeting.status,
          summaryState: await readSummaryState(this.deps.library, meetingId, (id) =>
            this.runs.has(id),
          ),
          speakerCount: 0,
        });
      } catch {
        // The meeting is gone; nothing to tell.
      }
    })();
  }

  private async execute(meetingId: string, run: Run): Promise<void> {
    const { library, gate } = this.deps;
    const signal = run.abort.signal;
    this.progress(meetingId, 'extracting', 0);
    try {
      const paths = await this.deps.readPaths();
      await gate.run(async () => {
        this.checkAbort(run);
        // Re-checked after the wait: a recording may have started while the gate was busy.
        if (this.deps.recordingActive()) this.stop(run, 'recording');
        this.checkAbort(run);
        const transcript = await library.readTranscript(meetingId);
        const { engine: lines, spans } = toEngineTranscript(transcript);
        if (lines.lines.length === 0) {
          throw new SummaryUnavailableError('There is no transcript text to summarize.');
        }
        const generated = await this.generate(meetingId, paths, lines, signal);
        this.checkAbort(run);
        if (this.deps.recordingActive()) this.stop(run, 'recording');
        this.checkAbort(run);
        const guarded = guardSummaryLinks(generated, spans);
        await library.saveGeneratedSummary(meetingId, guarded, transcript.revision);
      }, signal);
      this.progress(meetingId, 'done', 1);
    } catch (error) {
      this.fail(meetingId, run, error);
    } finally {
      this.changed(meetingId);
    }
  }

  private checkAbort(run: Run): void {
    if (run.abort.signal.aborted) throw new Error('Summary stopped');
  }

  private fail(meetingId: string, run: Run, error: unknown): void {
    const { library } = this.deps;
    if (run.reason !== null) {
      const message = STOP_MESSAGES[run.reason];
      if (message) this.progress(meetingId, 'failed', 0, message);
      return;
    }
    library.logger.log('error', 'summary-failed', errorFields(error));
    const message =
      error instanceof SummaryUnavailableError
        ? error.message
        : error instanceof StaleRevisionError
          ? STALE_MESSAGE
          : FAILED_MESSAGE;
    this.progress(meetingId, 'failed', 0, message);
  }

  /** Both lengths from one extraction, so the Brief/Full toggle never needs another run. */
  private async generate(
    meetingId: string,
    paths: SummaryPaths,
    transcript: Transcript,
    signal: AbortSignal,
  ): Promise<GeneratedSummary> {
    let contextTokens: number | undefined;
    for (;;) {
      try {
        return await this.runServer(meetingId, paths, transcript, signal, contextTokens);
      } catch (error) {
        // A server that runs out of memory gets one more try with a smaller context.
        const memory = error instanceof Error && OUT_OF_MEMORY.test(error.message);
        if (signal.aborted || !memory || contextTokens !== undefined) throw error;
        contextTokens = SMALL_CONTEXT;
      }
    }
  }

  private async runServer(
    meetingId: string,
    paths: SummaryPaths,
    transcript: Transcript,
    signal: AbortSignal,
    contextTokens: number | undefined,
  ): Promise<GeneratedSummary> {
    const { engine, pidFile } = this.deps;
    const server = engine.server(paths, contextTokens === undefined ? {} : { contextTokens });
    const onAbort = () => void server.stop();
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await server.start();
      if (pidFile && server.pid !== undefined && process.platform !== 'win32') {
        const startedAt = await processField(server.pid, 'lstart').catch(() => null);
        if (startedAt) {
          const record: ServerRecord = { pid: server.pid, startedAt, serverPath: paths.serverPath };
          await writeFile(pidFile, JSON.stringify(record));
        }
      }
      const extraction = await engine.extractItems(transcript, server, {
        signal,
        onProgress: (done, total, sections) =>
          this.progress(
            meetingId,
            done <= sections ? 'extracting' : 'coverageCheck',
            (done / total) * EXTRACTION_SHARE,
          ),
      });
      this.progress(meetingId, 'writing', EXTRACTION_SHARE);
      const brief = await engine.writeSummary(extraction, server, 'brief', { signal });
      this.progress(meetingId, 'writing', 0.85);
      const full = await engine.writeSummary(extraction, server, 'full', { signal });
      const at = (this.deps.now?.() ?? new Date()).toISOString();
      const first = toGeneratedSummary(brief, at);
      const second = toGeneratedSummary(full, at);
      return {
        ...first,
        full: second.full,
        warnings: [...new Set([...first.warnings, ...second.warnings])],
      };
    } finally {
      signal.removeEventListener('abort', onAbort);
      // The gate is released only after the process has exited.
      await server.stop();
      if (pidFile) await rm(pidFile, { force: true });
    }
  }
}
