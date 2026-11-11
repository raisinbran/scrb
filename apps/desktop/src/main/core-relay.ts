import type { SpawnOptionsWithStdioTuple, StdioPipe } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import {
  CORE_SCREEN_CALL_NAMES,
  ContractError,
  EVENT_NAMES,
  type ContractErrorCode,
  type EventName,
  type Hello,
} from '@scrb/contracts';
import type { CallHandlers } from './dispatch.ts';

// The core skips longer lines, so the relay never sends one.
const MAX_LINE_BYTES = 32 * 1024 * 1024;
// Twice the 15 seconds quit.ts gives an older core to finish, because a new core will wait for
// that core to release the library.
const HELLO_TIMEOUT_MS = 30_000;
const STDERR_LINES_KEPT = 200;
const RESTARTS_ALLOWED = 3;
const RESTART_WINDOW_MS = 60_000;

const OUT_OF_DATE = 'The backend is out of date. Reinstall Meeting Scribe.';
const STOPPED_UNEXPECTEDLY = 'The recorder stopped unexpectedly. Try again in a moment.';
const KEEPS_STOPPING = 'The recorder keeps stopping. Restart Meeting Scribe.';
const CLOSING = 'Meeting Scribe is closing.';

const KNOWN_CODES: Record<ContractErrorCode, true> = {
  notImplemented: true,
  invalidRequest: true,
  notFound: true,
  conflict: true,
  permissionDenied: true,
  diskFull: true,
  internal: true,
};
const ALLOWED_EVENTS = new Set<string>(EVENT_NAMES);

/** The parts of a child process the relay uses, so tests can pass a fake. */
export interface CoreProcess {
  readonly stdin: Writable;
  readonly stdout: Readable;
  readonly stderr: Readable;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
}

export type SpawnCore = (
  command: string,
  args: string[],
  options: SpawnOptionsWithStdioTuple<StdioPipe, StdioPipe, StdioPipe>,
) => CoreProcess;

export interface CoreOptions {
  binaryPath: string;
  hello: Hello;
  /** Sends an event to every window. */
  emit: (name: EventName, payload: unknown) => void;
  /** Gets the core's last stderr lines after each unexpected exit. */
  stderrLogPath: string;
  /** Runs after a restarted core answers `hello`. */
  onRestarted: () => void;
  /** Runs once, when the core has exited too often and the relay stops restarting it. */
  onStopped: () => void;
}

export interface CoreLink {
  /** One handler per name in `CORE_SCREEN_CALL_NAMES`, for `registerCallHandlers`. */
  handlers: CallHandlers;
  /** Sends `shutdown`, closes stdin and resolves when the core exits. Never kills the core. */
  close(): Promise<void>;
}

interface WaitingCall {
  resolve: (value: unknown) => void;
  reject: (error: ContractError) => void;
}

/** One run of the scrb-core process, from spawn to exit. */
interface Launch {
  child: CoreProcess;
  nextId: number;
  calls: Map<number, WaitingCall>;
  stderrTail: string[];
  /** Rejects when this core refused `hello`, timed out or exited during it. */
  handshake: Promise<void>;
  exited: boolean;
  /** Resolves when the process and its pipes have closed. */
  closed: Promise<void>;
}

/**
 * Starts scrb-core and returns its handlers. Read `startCore`, then `startLaunch` and
 * `endLaunch`, which restart the core after an unexpected exit.
 */
export function startCore(spawn: SpawnCore, options: CoreOptions): CoreLink {
  // Once set, every call fails with this error and the core is not restarted.
  let failure: ContractError | null = null;
  let recentExits: number[] = [];
  let launch = startLaunch(false);

  function startLaunch(restarted: boolean): Launch {
    const child = spawn(options.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
      // Without it, Windows ends the core the moment Electron exits, before it saves a recording.
      detached: true,
    });
    let markClosed = (): void => undefined;
    const current: Launch = {
      child,
      nextId: 1,
      calls: new Map(),
      stderrTail: [],
      handshake: Promise.resolve(),
      exited: false,
      closed: new Promise((resolve) => (markClosed = resolve)),
    };
    // These listeners exist before the first write, so a dead core cannot raise EPIPE in main.
    child.on('error', (error) => console.warn(`scrb-core: ${error.message}`));
    child.stdin.on('error', () => undefined);
    child.on('close', () => {
      endLaunch(current);
      markClosed();
    });
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) =>
      readLine(current, line),
    );
    // Stderr is always read, because a full pipe would block the core.
    createInterface({ input: child.stderr, crlfDelay: Infinity }).on('line', (line) => {
      current.stderrTail.push(line);
      if (current.stderrTail.length > STDERR_LINES_KEPT) current.stderrTail.shift();
    });
    current.handshake = shakeHands(current).then(() => {
      if (restarted) options.onRestarted();
    });
    // Callers await the handshake and see its error.
    current.handshake.catch(() => undefined);
    return current;
  }

  async function shakeHands(current: Launch): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('no answer to hello')), HELLO_TIMEOUT_MS);
    });
    try {
      await Promise.race([send(current, 'hello', options.hello), timedOut]);
    } catch (error) {
      // A core that exited during hello already failed its calls and is restarted.
      if (current.exited) throw error;
      console.warn(`scrb-core refused hello: ${error instanceof Error ? error.message : ''}`);
      failure = new ContractError({ code: 'internal', message: OUT_OF_DATE });
      current.child.stdin.end();
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  }

  function endLaunch(current: Launch): void {
    current.exited = true;
    const error = failure ?? new ContractError({ code: 'internal', message: STOPPED_UNEXPECTEDLY });
    for (const call of current.calls.values()) call.reject(error);
    current.calls.clear();
    if (failure) return;

    writeFile(options.stderrLogPath, current.stderrTail.join('\n')).catch((error: unknown) =>
      console.warn(`scrb-core stderr log: ${error instanceof Error ? error.message : ''}`),
    );
    const now = Date.now();
    recentExits = [...recentExits.filter((time) => now - time < RESTART_WINDOW_MS), now];
    if (recentExits.length > RESTARTS_ALLOWED) {
      failure = new ContractError({ code: 'internal', message: KEEPS_STOPPING });
      options.onStopped();
      return;
    }
    launch = startLaunch(true);
  }

  function send(current: Launch, call: string, request: unknown): Promise<unknown> {
    const id = current.nextId++;
    const line = `${JSON.stringify(request === undefined ? { id, call } : { id, call, req: request })}\n`;
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) {
      return Promise.reject(
        new ContractError({ code: 'invalidRequest', message: 'That request is too large.' }),
      );
    }
    return new Promise((resolve, reject) => {
      current.calls.set(id, { resolve, reject });
      current.child.stdin.write(line);
    });
  }

  async function callScreen(name: string, request: unknown): Promise<unknown> {
    if (failure) throw failure;
    const current = launch;
    await current.handshake;
    if (failure) throw failure;
    if (current.exited) {
      throw new ContractError({ code: 'internal', message: STOPPED_UNEXPECTEDLY });
    }
    return send(current, name, request);
  }

  function readLine(current: Launch, line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      console.warn('scrb-core sent a line that is not JSON.');
      return;
    }
    if (!isRecord(message)) {
      console.warn('scrb-core sent a line that is not an object.');
    } else if (typeof message['event'] === 'string') {
      forwardEvent(message['event'], message['data']);
    } else if (typeof message['id'] === 'number' && typeof message['ok'] === 'boolean') {
      settleCall(current, message['id'], message);
    } else {
      console.warn('scrb-core sent a line that is not a reply or an event.');
    }
  }

  function forwardEvent(name: string, payload: unknown): void {
    if (!isAllowedEvent(name)) {
      console.warn(`scrb-core sent an event outside the allowlist: ${name}`);
      return;
    }
    options.emit(name, payload);
  }

  function settleCall(current: Launch, id: number, reply: Record<string, unknown>): void {
    const call = current.calls.get(id);
    // Id 0 means the core could not read the id of a bad line.
    if (!call) {
      console.warn(`scrb-core replied to unknown call ${id}.`);
      return;
    }
    current.calls.delete(id);
    if (reply['ok'] === true) call.resolve(reply['value']);
    else call.reject(toContractError(reply['error']));
  }

  const handlers: CallHandlers = Object.fromEntries(
    CORE_SCREEN_CALL_NAMES.map((name) => [name, (request: unknown) => callScreen(name, request)]),
  );

  return {
    handlers,
    async close() {
      failure ??= new ContractError({ code: 'internal', message: CLOSING });
      const current = launch;
      if (!current.exited && !current.child.stdin.writableEnded) {
        send(current, 'shutdown', undefined).catch(() => undefined);
        current.child.stdin.end();
      }
      await current.closed;
    },
  };
}

function isKnownCode(code: unknown): code is ContractErrorCode {
  return typeof code === 'string' && Object.hasOwn(KNOWN_CODES, code);
}

function isAllowedEvent(name: string): name is EventName {
  return ALLOWED_EVENTS.has(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Keeps the core's error code when the screens know it, and its message, which is safe to show. */
function toContractError(error: unknown): ContractError {
  const fields = isRecord(error) ? error : {};
  const code = fields['code'];
  const message = fields['message'];
  return new ContractError({
    code: isKnownCode(code) ? code : 'internal',
    message: typeof message === 'string' ? message : 'Something went wrong.',
  });
}
