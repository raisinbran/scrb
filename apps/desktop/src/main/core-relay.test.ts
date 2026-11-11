// @vitest-environment node
import { EventEmitter } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError } from '@scrb/contracts';
import { startCore, type CoreOptions } from './core-relay.ts';

/** A scrb-core stand-in. The test controls its replies, bad lines and exits. */
class FakeCore extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly requests: { id: number; call: string; req?: unknown }[] = [];

  constructor() {
    super();
    // This does not use readline, which would add its own error listener to stdin and hide a
    // missing one.
    let partial = '';
    this.stdin.setEncoding('utf8').on('data', (chunk: string) => {
      const lines = (partial + chunk).split('\n');
      partial = lines.pop() ?? '';
      for (const line of lines)
        this.requests.push(JSON.parse(line) as FakeCore['requests'][number]);
    });
  }

  /** Waits for the request named `call` and returns its id. */
  async received(call: string): Promise<number> {
    await vi.waitFor(() => expect(this.requests.map((request) => request.call)).toContain(call));
    return this.requests.find((request) => request.call === call)?.id ?? 0;
  }

  /** Answers hello as a core with the same protocol does. */
  async answerHello(): Promise<void> {
    const id = await this.received('hello');
    this.send({ id, ok: true, value: { protocol: 1, coreVersion: '0.1.0' } });
  }

  /** Writes one message to the relay as one line. */
  send(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  /** Dies as a killed process does. Stdin fails with EPIPE, then the pipes close. */
  crash(): void {
    this.stdin.destroy(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }));
    this.stdout.end();
    this.stderr.end();
    this.emit('close', null, 'SIGKILL');
  }
}

/** Starts the relay on fake cores; each spawn adds one to `cores`. */
function startOnFakes(overrides: Partial<CoreOptions> = {}) {
  const cores: FakeCore[] = [];
  const spawn = vi.fn(() => {
    const core = new FakeCore();
    cores.push(core);
    return core;
  });
  const options: CoreOptions = {
    binaryPath: 'scrb-core',
    hello: {
      protocol: 1,
      appName: 'Meeting Scribe',
      appVersion: '0.1.0',
      userDataDir: '/user-data',
      documentsDir: '/documents',
      countryCode: null,
    },
    emit: vi.fn(),
    stderrLogPath: join(mkdtempSync(join(tmpdir(), 'scrb-relay-')), 'scrb-core-stderr.log'),
    onRestarted: vi.fn(),
    onStopped: vi.fn(),
    ...overrides,
  };
  const link = startCore(spawn, options);
  const getAppInfo = () => link.handlers.getAppInfo?.(undefined) ?? Promise.reject(new Error());
  return { cores, spawn, options, link, getAppInfo };
}

/** The core and the relay right after a successful handshake. */
async function startReady(overrides: Partial<CoreOptions> = {}) {
  const started = startOnFakes(overrides);
  const core = started.cores[0] ?? new FakeCore();
  await core.answerHello();
  return { ...started, core };
}

/** An About answer as the core sends it. */
const APP_INFO = {
  name: 'Meeting Scribe',
  version: '0.1.0',
  buildDate: 'Development build',
  copyright: 'Copyright 2026 the Meeting Scribe authors',
  storageStatement: 'Stored on this computer.',
  models: [],
};

describe('startCore', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** A screen call sent before hello would get the core's "still starting" refusal at launch. */
  it('holds screen calls until hello is answered', async () => {
    const { cores, getAppInfo } = startOnFakes();
    const core = cores[0] ?? new FakeCore();
    const info = getAppInfo();
    await core.received('hello');

    // Lets any line the relay wrote reach the fake before checking.
    await new Promise((resolve) => setImmediate(resolve));
    expect(core.requests.map((request) => request.call)).toEqual(['hello']);

    await core.answerHello();
    core.send({ id: await core.received('getAppInfo'), ok: true, value: APP_INFO });
    await expect(info).resolves.toEqual(APP_INFO);
  });

  /** Pipes split lines anywhere, and one bad line from the core must not lose later replies. */
  it('reads split replies and skips bad lines', async () => {
    const { core, getAppInfo } = await startReady();
    const info = getAppInfo();
    const id = await core.received('getAppInfo');
    const reply = Buffer.from(
      `${JSON.stringify({ id, ok: true, value: { ...APP_INFO, name: 'Réunion' } })}\n`,
    );
    const middleOfE = reply.indexOf(Buffer.from('é')) + 1;

    core.stdout.write('this is not JSON\n');
    core.stdout.write(reply.subarray(0, middleOfE));
    core.stdout.write(reply.subarray(middleOfE));

    await expect(info).resolves.toMatchObject({ name: 'Réunion' });
  });

  /** The screens act on the error's code, so an unknown code must not reach them. */
  it.each([
    { sent: 'conflict', expected: 'conflict' },
    { sent: 'busy', expected: 'internal' },
  ])('error replies keep only known codes ($sent)', async ({ sent, expected }) => {
    const { core, getAppInfo } = await startReady();
    const info = getAppInfo();

    core.send({
      id: await core.received('getAppInfo'),
      ok: false,
      error: { code: sent, message: 'Nothing is recording.' },
    });

    await expect(info).rejects.toMatchObject({ code: expected, message: 'Nothing is recording.' });
  });

  /**
   * A crash must fail the waiting call with `internal`, never `notImplemented`, the code that
   * makes the hybrid backend's mock side answer instead. A write to the dead core must not
   * crash main.
   */
  it('a crash fails waiting calls and restarts', async () => {
    const { cores, core, getAppInfo, options } = await startReady();
    const waiting = getAppInfo();
    await core.received('getAppInfo');

    core.crash();

    await expect(waiting).rejects.toEqual(
      new ContractError({
        code: 'internal',
        message: 'The recorder stopped unexpectedly. Try again in a moment.',
      }),
    );
    const restarted = cores[1] ?? new FakeCore();
    const later = getAppInfo();
    await restarted.answerHello();
    restarted.send({ id: await restarted.received('getAppInfo'), ok: true, value: APP_INFO });
    expect(options.onRestarted).toHaveBeenCalledOnce();
    await expect(later).resolves.toEqual(APP_INFO);
  });

  /** Windows must receive only events their allowlist names. */
  it('forwards only allowed event names to windows', async () => {
    const { core, options } = await startReady();
    const payload = { id: 'm_1', title: 'Weekly sync' };

    core.send({ event: 'openPath', data: { path: '/private' } });
    core.send({ event: 'meetingChanged', data: payload });

    await vi.waitFor(() => expect(options.emit).toHaveBeenCalled());
    expect(options.emit).toHaveBeenCalledExactlyOnceWith('meetingChanged', payload);
  });

  /** A stale core build must not serve calls or be restarted over and over. */
  it('a protocol mismatch fails calls without restarting', async () => {
    const { cores, spawn, getAppInfo } = startOnFakes();
    const core = cores[0] ?? new FakeCore();
    const info = getAppInfo();

    core.send({
      id: await core.received('hello'),
      ok: false,
      error: { code: 'conflict', message: 'scrb-core speaks protocol 2 but the app sent 1.' },
    });

    const outOfDate = {
      code: 'internal',
      message: 'The backend is out of date. Reinstall Meeting Scribe.',
    };
    await expect(info).rejects.toMatchObject(outOfDate);
    await vi.waitFor(() => expect(core.stdin.writableEnded).toBe(true));
    core.crash();
    await expect(getAppInfo()).rejects.toMatchObject(outOfDate);
    expect(spawn).toHaveBeenCalledOnce();
  });

  /** Only hello has a timeout, so a core that hangs at launch must not leave calls waiting. */
  it('a hello timeout fails calls as outdated', async () => {
    vi.useFakeTimers();
    const { cores, getAppInfo } = startOnFakes();
    const info = getAppInfo();
    await cores[0]?.received('hello');
    const failed = expect(info).rejects.toMatchObject({
      code: 'internal',
      message: 'The backend is out of date. Reinstall Meeting Scribe.',
    });

    await vi.advanceTimersByTimeAsync(30_000);

    await failed;
  });

  /** Quitting must let the core save its work and must not start a new core. */
  it('close sends shutdown and resolves without restarting', async () => {
    const { core, spawn, link } = await startReady();

    const closed = link.close();
    await core.received('shutdown');
    await vi.waitFor(() => expect(core.stdin.writableEnded).toBe(true));
    core.emit('close', 0, null);

    await expect(closed).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledOnce();
  });
});
