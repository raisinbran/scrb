import { spawn, type ChildProcess } from 'node:child_process';
import { setPriority } from 'node:os';
import type { Readable, Writable } from 'node:stream';

const STDERR_TAIL_BYTES = 16 * 1024;
const BACKGROUND_NICE = 10;

export interface WorkerSpec {
  name: string;
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
  /** Background work runs at lower priority; on by default. */
  background?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Keep stdin open for a request-and-reply protocol. */
  stdin?: boolean;
  onStderrLine?: (line: string) => void;
}

export interface WorkerExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Stopped by kill(), the abort signal or the timeout, not by itself. */
  killed: boolean;
  timedOut: boolean;
  /** Last bytes of stderr, for error reports.  Never write this to a log file. */
  stderrTail: string;
  spawnError?: string;
}

/**
 * One native tool in its own process.  Nothing heavy runs in the caller, so a
 * hung or crashed model can be killed without touching the app or the
 * recording, which live in other processes.
 */
export class WorkerProcess {
  readonly done: Promise<WorkerExit>;
  private readonly child: ChildProcess;
  private killedByUs = false;
  private timedOut = false;

  constructor(spec: WorkerSpec) {
    this.child = spawn(spec.command, spec.args, {
      stdio: [spec.stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      env: spec.env ?? process.env,
      windowsHide: true,
      shell: false,
    });
    this.done = this.track(spec);
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get stdout(): Readable {
    return this.child.stdout!;
  }

  get stdin(): Writable {
    return this.child.stdin!;
  }

  /** Hard stop: no cleanup is needed inside any of the tools. */
  kill(): void {
    this.killedByUs = true;
    this.child.kill('SIGKILL');
  }

  private track(spec: WorkerSpec): Promise<WorkerExit> {
    const child = this.child;
    if (spec.background !== false && child.pid !== undefined) {
      try {
        setPriority(child.pid, BACKGROUND_NICE);
      } catch {
        // The process may already have exited; lower priority is best effort.
      }
    }

    const onAbort = (): void => this.kill();
    if (spec.signal?.aborted) onAbort();
    else spec.signal?.addEventListener('abort', onAbort, { once: true });
    const timer =
      spec.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            this.timedOut = true;
            this.kill();
          }, spec.timeoutMs);

    let tail = '';
    let partial = '';
    child.stderr!.setEncoding('utf8');
    child.stderr!.on('data', (text: string) => {
      tail = (tail + text).slice(-STDERR_TAIL_BYTES);
      if (!spec.onStderrLine) return;
      const lines = (partial + text).split(/\r?\n/);
      partial = lines.pop() ?? '';
      for (const line of lines) spec.onStderrLine(line);
    });

    return new Promise((resolve) => {
      let spawnError: string | undefined;
      child.on('error', (err) => {
        spawnError = err.message;
      });
      child.on('close', (code, signal) => {
        if (timer) clearTimeout(timer);
        spec.signal?.removeEventListener('abort', onAbort);
        resolve({
          code,
          signal,
          killed: this.killedByUs,
          timedOut: this.timedOut,
          stderrTail: tail,
          ...(spawnError === undefined ? {} : { spawnError }),
        });
      });
    });
  }
}

export class WorkerFailed extends Error {
  constructor(
    readonly worker: string,
    readonly exit: WorkerExit,
  ) {
    super(`${worker} ${describeExit(exit)}`);
    this.name = 'WorkerFailed';
  }
}

export function describeExit(exit: WorkerExit): string {
  if (exit.spawnError) return `could not start: ${exit.spawnError}`;
  if (exit.timedOut) return 'timed out';
  if (exit.killed) return 'was stopped';
  if (exit.signal) return `crashed (${exit.signal})`;
  return `exited with code ${exit.code}`;
}

/** Runs a tool to completion and collects stdout, or throws WorkerFailed. */
export async function runToCompletion(spec: WorkerSpec): Promise<string> {
  const worker = new WorkerProcess(spec);
  const chunks: Buffer[] = [];
  worker.stdout.on('data', (b: Buffer) => chunks.push(b));
  const exit = await worker.done;
  if (exit.code !== 0) throw new WorkerFailed(spec.name, exit);
  return Buffer.concat(chunks).toString('utf8');
}
