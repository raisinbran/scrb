// @vitest-environment node
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LargeModelGate } from '@scrb/app-core';
import type { BackendEvents, EventName } from '@scrb/contracts';
import { Library } from '@scrb/storage';
import { LlamaServerWorker, type Extraction, type MeetingSummary } from '@scrb/summary';
import { dispatchCall, type CallHandlers } from './dispatch.ts';
import { createMeetingHandlers } from './meetings.ts';
import {
  readSummaryPaths,
  SummaryController,
  type ModelServer,
  type SummaryEngine,
} from './summary.ts';

// Invented transcript: two segments, 0-4 s and 10-14 s.
const word = (id: string, text: string, startMs: number) => ({
  id,
  text,
  startMs,
  endMs: startMs + 400,
});
const speaker = {
  id: 'a',
  label: 'Speaker A',
  name: 'Sam',
  profileId: null,
  userNamed: false,
  mergedInto: null,
};

type Seen = { name: EventName; payload: unknown };

function engineSummary(length: 'brief' | 'full', times: number[]): MeetingSummary {
  const item = (id: string, seconds: number) => ({
    id,
    text: `Item ${id}`,
    evidence: { lineIndex: 0, timestampSec: seconds },
    alsoAt: [],
    flags: [],
    pass: 'test',
  });
  return {
    schemaVersion: 1,
    sourceHash: 'h',
    model: 'fake',
    body:
      length === 'brief'
        ? { length, paragraphs: ['Brief text.'] }
        : { length, overview: 'Overview text.', mainTopics: [] },
    actions: times.map((seconds, index) => ({
      ...item(`a-${index}`, seconds),
      kind: 'action' as const,
      owner: 'Sam',
      deadline: 'Not specified',
      status: 'Agreed' as const,
    })),
    decisions: [],
    impacts: [],
    openQuestions: [],
    warnings: [],
  };
}

describe('SummaryController', () => {
  let library: Library;
  let clock: { t: number };
  let meetingId: string;
  let seen: Seen[];
  let recording: boolean;
  let gate: LargeModelGate;
  let hooks: {
    start: () => Promise<void>;
    extract: (signal: AbortSignal | undefined) => Promise<void>;
    stops: number;
    starts: number;
    times: number[];
  };
  let controller: SummaryController;
  let handlers: CallHandlers;
  let meetingHandlers: CallHandlers;

  const engine: SummaryEngine = {
    server: (): ModelServer => ({
      modelName: 'fake',
      pid: undefined,
      complete: () => Promise.reject(new Error('not used')),
      start: async () => {
        hooks.starts += 1;
        await hooks.start();
      },
      stop: async () => {
        hooks.stops += 1;
      },
    }),
    extractItems: async (_transcript, _llm, options) => {
      await hooks.extract(options.signal);
      return { warnings: [] } as unknown as Extraction;
    },
    writeSummary: async (_extraction, _llm, length) => engineSummary(length, hooks.times),
  };

  const progress = () =>
    seen
      .filter((event) => event.name === 'summaryProgress')
      .map((event) => event.payload as BackendEvents['summaryProgress']);
  const last = () => progress().at(-1);

  beforeEach(async () => {
    clock = { t: new Date('2026-11-13T10:00:00Z').getTime() };
    library = await Library.open({
      root: mkdtempSync(join(tmpdir(), 'scrb-summary-')),
      now: () => new Date(clock.t),
    });
    const meeting = await library.createMeeting({
      title: 'Invented sync',
      date: '2026-11-13T10:00:00Z',
      source: 'recorded',
      status: 'ready',
      durationMs: 14_000,
    });
    meetingId = meeting.id;
    await library.appendSegments(
      meetingId,
      [
        {
          id: 's1',
          speakerId: 'a',
          track: 'meeting',
          pass: 'final',
          words: [word('w1', 'Book', 0), word('w2', 'the', 1000), word('w3', 'room', 2000)],
        },
        {
          id: 's2',
          speakerId: 'a',
          track: 'meeting',
          pass: 'final',
          words: [word('w4', 'Thanks', 10_000), word('w5', 'all', 13_000)],
        },
      ],
      [speaker],
    );
    seen = [];
    recording = false;
    gate = new LargeModelGate();
    hooks = {
      start: async () => undefined,
      extract: async () => undefined,
      stops: 0,
      starts: 0,
      times: [1, 11],
    };
    const emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => {
      seen.push({ name, payload });
    };
    controller = new SummaryController({
      library,
      emit,
      gate,
      engine,
      recordingActive: () => recording,
      readPaths: async () => ({ serverPath: '/fake/server', modelPath: '/fake/model.gguf' }),
      now: () => new Date('2026-11-13T12:00:00Z'),
    });
    meetingHandlers = createMeetingHandlers(library, emit, undefined, null, (id) =>
      controller.isRunning(id),
    );
    handlers = { ...meetingHandlers, ...controller.handlers };
  });

  afterEach(async () => {
    await controller.shutdown();
    await library.close();
  });

  /** Starts a run and waits for it to end on its own. */
  const runToEnd = async () => {
    const envelope = await dispatchCall(handlers, 'generateSummary', {
      meetingId,
      length: 'brief',
    });
    if (!envelope.ok) throw new Error(envelope.error.message);
    while (controller.isRunning(meetingId)) await new Promise((resolve) => setTimeout(resolve, 5));
  };
  const state = async () =>
    (
      (await dispatchCall(handlers, 'getMeeting', { meetingId })) as {
        value: { summaryState: string };
      }
    ).value.summaryState;

  it('saves both lengths and the linked items, then reports ready', async () => {
    expect(await state()).toBe('notGenerated');
    await runToEnd();
    expect(last()).toMatchObject({ stage: 'done', fraction: 1 });
    const file = await library.readSummary(meetingId);
    expect(file?.brief?.sections[0]?.text).toBe('Brief text.');
    expect(file?.full?.sections[0]?.text).toBe('Overview text.');
    expect(file?.actionItems.map((item) => item.sourceMs)).toEqual([1000, 11_000]);
    expect(await state()).toBe('ready');
    expect(hooks.stops).toBeGreaterThan(0);
    const list = (await dispatchCall(handlers, 'listMeetings', {})) as {
      value: { summaryState: string }[];
    };
    expect(list.value[0]?.summaryState).toBe('ready');
  });

  it('reports generating while it runs and maps progress to extraction then writing', async () => {
    let release: () => void = () => undefined;
    hooks.extract = () => new Promise((resolve) => (release = resolve));
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'full' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await state()).toBe('generating');
    release();
    while (controller.isRunning(meetingId)) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(progress().map((event) => event.stage)).toEqual([
      'extracting',
      'writing',
      'writing',
      'done',
    ]);
  });

  it('refuses to start while a recording is active', async () => {
    recording = true;
    const envelope = await dispatchCall(handlers, 'generateSummary', {
      meetingId,
      length: 'brief',
    });
    expect(envelope).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(hooks.starts).toBe(0);
    expect(await library.readSummary(meetingId)).toBeNull();
  });

  it('refuses a meeting whose final transcript is not ready', async () => {
    await library.updateMeeting(meetingId, { status: 'finalPassRunning' });
    const envelope = await dispatchCall(handlers, 'generateSummary', {
      meetingId,
      length: 'brief',
    });
    expect(envelope).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(hooks.starts).toBe(0);
  });

  it('stops before the server starts when a recording starts while it waits for the gate', async () => {
    let free: () => void = () => undefined;
    const holder = gate.run(() => new Promise<void>((resolve) => (free = resolve)));
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    recording = true;
    controller.recordingStarted();
    free();
    await holder;
    while (controller.isRunning(meetingId)) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(hooks.starts).toBe(0);
    expect(last()).toMatchObject({
      stage: 'failed',
      message: 'Summary stopped because a recording started. Run it again after.',
    });
    expect(await library.readSummary(meetingId)).toBeNull();
  });

  it('waits for a final pass that holds the gate, then runs after it', async () => {
    let free: () => void = () => undefined;
    const holder = gate.run(() => new Promise<void>((resolve) => (free = resolve)));
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(hooks.starts).toBe(0);
    free();
    await holder;
    while (controller.isRunning(meetingId)) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(last()?.stage).toBe('done');
  });

  it('aborts mid-run when a recording starts, stops the server and keeps the old summary', async () => {
    await runToEnd();
    const before = await library.readSummary(meetingId);
    seen = [];
    hooks.times = [2];
    hooks.extract = (signal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
        controller.recordingStarted();
      });
    await runToEnd();
    expect(last()).toMatchObject({
      stage: 'failed',
      message: 'Summary stopped because a recording started. Run it again after.',
    });
    expect(await library.readSummary(meetingId)).toEqual(before);
  });

  it('does not save when a recording starts during the final steps', async () => {
    hooks.extract = async () => {
      recording = true;
    };
    await runToEnd();
    expect(last()).toMatchObject({ stage: 'failed' });
    expect(await library.readSummary(meetingId)).toBeNull();
  });

  describe('transcript edited between read and save', () => {
    it('saves nothing for a first summary', async () => {
      hooks.extract = async () => {
        await library.renameSpeaker(meetingId, 'a', 'Pat');
      };
      await runToEnd();
      expect(last()).toMatchObject({
        stage: 'failed',
        message: 'The transcript changed while the summary ran. Run it again.',
      });
      expect(await library.readSummary(meetingId)).toBeNull();
    });

    it('keeps an earlier summary, flagged outdated, on a regeneration', async () => {
      await runToEnd();
      hooks.times = [3];
      hooks.extract = async () => {
        await library.renameSpeaker(meetingId, 'a', 'Pat');
      };
      await runToEnd();
      expect(last()?.stage).toBe('failed');
      const kept = await library.readSummary(meetingId);
      expect(kept?.actionItems).toHaveLength(2);
      expect(kept?.outdated).toBe(true);
      expect(await state()).toBe('outdated');
    });
  });

  it('remaps a link in a short gap, and drops items and links that point nowhere', async () => {
    // 6 s lies 2 s after the first segment ends; 7000 s is far past the meeting.
    hooks.times = [6, 7000, 1];
    await runToEnd();
    const file = await library.readSummary(meetingId);
    expect(file?.actionItems.map((item) => [item.sourceMs, item.needsReview])).toEqual([
      [2400, true],
      [1000, false],
    ]);
    expect(file?.warnings.at(-1)).toMatch(/1 items were left out/);
  });

  it('cancels a running summary, keeps the old one, and ignores a repeat', async () => {
    await runToEnd();
    const before = await library.readSummary(meetingId);
    seen = [];
    hooks.extract = (signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('x'))),
      );
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await dispatchCall(handlers, 'cancelSummary', { meetingId })).toMatchObject({
      ok: true,
    });
    expect(await dispatchCall(handlers, 'cancelSummary', { meetingId })).toMatchObject({
      ok: true,
    });
    expect(progress().filter((event) => event.stage === 'failed')).toEqual([
      expect.objectContaining({ message: 'Summary cancelled.' }),
    ]);
    expect(await library.readSummary(meetingId)).toEqual(before);
    expect(hooks.stops).toBeGreaterThan(0);
  });

  it('does nothing when cancelling with no run, and reports an unknown meeting', async () => {
    expect(await dispatchCall(handlers, 'cancelSummary', { meetingId })).toMatchObject({
      ok: true,
    });
    expect(await dispatchCall(handlers, 'cancelSummary', { meetingId: 'nope-1' })).toMatchObject({
      ok: false,
      error: { code: 'notFound' },
    });
    expect(progress()).toEqual([]);
  });

  it('reports a failing engine in plain words, stops the server and keeps the old summary', async () => {
    hooks.start = () =>
      Promise.reject(new Error('llama-server exited during startup: secret text'));
    await runToEnd();
    expect(last()).toMatchObject({
      stage: 'failed',
      message: 'The summary could not be generated. Your audio and transcript are safe.',
    });
    expect(JSON.stringify(seen)).not.toContain('secret text');
    expect(hooks.stops).toBe(1);
    expect(await library.readSummary(meetingId)).toBeNull();
  });

  it('retries once with a smaller context when the server runs out of memory', async () => {
    let attempt = 0;
    const contexts: Array<number | undefined> = [];
    const retrying: SummaryEngine = {
      ...engine,
      server: (paths, options) => {
        contexts.push(options.contextTokens);
        return engine.server(paths, options);
      },
    };
    hooks.start = async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('failed to allocate buffer: out of memory');
    };
    const retryController = new SummaryController({
      library,
      emit: () => undefined,
      gate,
      engine: retrying,
      recordingActive: () => false,
      readPaths: async () => ({ serverPath: '/x', modelPath: '/y' }),
    });
    await retryController.handlers.generateSummary!({ meetingId, length: 'brief' });
    while (retryController.isRunning(meetingId)) await new Promise((r) => setTimeout(r, 5));
    expect(contexts).toEqual([undefined, 16384]);
    expect(await library.readSummary(meetingId)).not.toBeNull();
  });

  it('names what is missing when the model or llama.cpp is not set up', async () => {
    const missing = new SummaryController({
      library,
      emit: (name, payload) => seen.push({ name, payload }),
      gate,
      engine,
      recordingActive: () => false,
      readPaths: () => readSummaryPaths(undefined),
    });
    await missing.handlers.generateSummary!({ meetingId, length: 'brief' });
    while (missing.isRunning(meetingId)) await new Promise((r) => setTimeout(r, 5));
    expect(last()?.message).toMatch(/No setup file/);
    const dir = mkdtempSync(join(tmpdir(), 'scrb-summary-cfg-'));
    const config = join(dir, 'config.json');
    writeFileSync(config, JSON.stringify({ tools: { llamaServer: join(dir, 'no') }, models: {} }));
    await expect(readSummaryPaths(config)).rejects.toThrow(
      /Missing: the llama.cpp server and the summary model/,
    );
    writeFileSync(join(dir, 'server'), '');
    writeFileSync(join(dir, 'model'), '');
    writeFileSync(
      config,
      JSON.stringify({
        tools: { llamaServer: join(dir, 'server') },
        models: { summary: join(dir, 'model') },
      }),
    );
    await expect(readSummaryPaths(config)).resolves.toEqual({
      serverPath: join(dir, 'server'),
      modelPath: join(dir, 'model'),
    });
  });

  it('stops a run before deleting its meeting', async () => {
    hooks.extract = (signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('x'))),
      );
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await controller.stopAndWait(meetingId, 'deleted');
    expect(controller.isRunning(meetingId)).toBe(false);
    expect(progress().some((event) => event.stage === 'failed')).toBe(false);
  });

  it('stops a running summary, and waits for its server, before scheduled retention deletes the meeting', async () => {
    const order: string[] = [];
    hooks.extract = (signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('x'))),
      );
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const stopsBefore = hooks.stops;
    library.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    clock.t += 31 * 86_400_000;
    const run = await library.runAutoDelete(async (id) => {
      await controller.stopAndWait(id, 'deleted');
      order.push(`stopped:${hooks.stops > stopsBefore}`);
    });
    expect(run.results[0]?.ok).toBe(true);
    expect(order).toEqual(['stopped:true']);
    expect(controller.isRunning(meetingId)).toBe(false);
    expect(library.listMeetings()).toHaveLength(0);
  });

  it('is not started twice for one meeting', async () => {
    let release: () => void = () => undefined;
    hooks.extract = () => new Promise((resolve) => (release = resolve));
    await generateTwice();
    release();
    while (controller.isRunning(meetingId)) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(hooks.starts).toBe(1);
    async function generateTwice() {
      await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    }
  });

  it('shutdown stops every run and its server', async () => {
    hooks.extract = (signal) =>
      new Promise((_resolve, reject) =>
        signal?.addEventListener('abort', () => reject(new Error('x'))),
      );
    await dispatchCall(handlers, 'generateSummary', { meetingId, length: 'brief' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await controller.shutdown();
    expect(controller.isRunning(meetingId)).toBe(false);
    expect(hooks.stops).toBeGreaterThan(0);
  });
});

// The fake server is a Node script, which Windows cannot start directly as an executable.
describe.skipIf(process.platform === 'win32')('with a real server process', () => {
  const fake = fileURLToPath(
    new URL('../../../../packages/summary/test/fixtures/fake-llama-server.mjs', import.meta.url),
  );
  let library: Library;
  let meetingId: string;
  let pids: number[];
  let args: string[];

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  beforeEach(async () => {
    pids = [];
    args = [];
    library = await Library.open({ root: mkdtempSync(join(tmpdir(), 'scrb-summary-real-')) });
    meetingId = (
      await library.createMeeting({
        title: 'Invented real',
        date: '2026-11-13T10:00:00Z',
        source: 'recorded',
        status: 'ready',
        durationMs: 5000,
      })
    ).id;
    await library.appendSegments(
      meetingId,
      [
        {
          id: 's1',
          speakerId: 'a',
          track: 'meeting',
          pass: 'final',
          words: [word('w1', 'Hello', 0)],
        },
      ],
      [speaker],
    );
  });
  afterEach(() => library.close());

  const controllerWith = (extract: SummaryEngine['extractItems'], pidFile: string) =>
    new SummaryController({
      library,
      emit: () => undefined,
      gate: new LargeModelGate(),
      engine: {
        server: (paths, options) => {
          const worker = new LlamaServerWorker({ ...paths, ...options });
          const start = worker.start.bind(worker);
          worker.start = async () => {
            await start();
            if (worker.pid !== undefined) pids.push(worker.pid);
          };
          return worker;
        },
        extractItems: extract,
        writeSummary: async (_e, _l, length) => engineSummary(length, [0]),
      },
      recordingActive: () => false,
      readPaths: async () => ({ serverPath: fake, modelPath: '/models/fake.gguf' }),
      pidFile,
    });

  it('binds the server to loopback only, and leaves no process after quit', async () => {
    const pidFile = join(mkdtempSync(join(tmpdir(), 'scrb-summary-pid-')), 'server.pid');
    const controller = controllerWith(async (_t, llm, options) => {
      const response = await llm.complete({
        messages: [{ role: 'user', content: 'x' }],
        schema: {},
        maxTokens: 1,
      });
      args = (JSON.parse(response.content) as { args: string[] }).args;
      expect(existsSync(pidFile)).toBe(true);
      await new Promise((_resolve, reject) =>
        options.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
      return {} as Extraction;
    }, pidFile);
    await controller.handlers.generateSummary!({ meetingId, length: 'brief' });
    while (pids.length === 0 || args.length === 0) await new Promise((r) => setTimeout(r, 10));
    expect(args[args.indexOf('--host') + 1]).toBe('127.0.0.1');
    expect(args.join(' ')).not.toMatch(/0\.0\.0\.0|https?:/);
    expect(alive(pids[0]!)).toBe(true);

    await controller.shutdown();
    expect(alive(pids[0]!)).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
  });

  describe('stale server cleanup', () => {
    const spawned: ChildProcess[] = [];
    afterEach(() => {
      for (const child of spawned.splice(0)) child.kill('SIGKILL');
    });
    const startFake = async () => {
      const child = spawn(fake, ['--port', '0'], { stdio: 'ignore' });
      spawned.push(child);
      await new Promise((resolve) => setTimeout(resolve, 150));
      const startedAt = (
        await promisify(execFile)('ps', ['-p', String(child.pid), '-o', 'lstart='], {
          env: { ...process.env, LC_ALL: 'C' },
        })
      ).stdout.trim();
      return { child, pid: child.pid!, startedAt };
    };
    const cleanWith = async (record: unknown) => {
      const pidFile = join(mkdtempSync(join(tmpdir(), 'scrb-summary-pid-')), 'server.pid');
      writeFileSync(pidFile, typeof record === 'string' ? record : JSON.stringify(record));
      await controllerWith(async () => ({}) as Extraction, pidFile).stopStaleServer();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(existsSync(pidFile)).toBe(false);
    };

    it('stops our own leftover server', async () => {
      const { pid, startedAt } = await startFake();
      await cleanWith({ pid, startedAt, serverPath: fake });
      expect(alive(pid)).toBe(false);
    });

    it('leaves a same-name server alone when the process id was recycled (other start time)', async () => {
      const { pid } = await startFake();
      await cleanWith({ pid, startedAt: 'Mon Jan  1 00:00:00 2001', serverPath: fake });
      expect(alive(pid)).toBe(true);
    });

    it('leaves a process alone when it is not our server path', async () => {
      const { pid, startedAt } = await startFake();
      await cleanWith({ pid, startedAt, serverPath: '/somewhere/else/llama-server' });
      expect(alive(pid)).toBe(true);
    });

    it('leaves an unrelated process alone for an old-format or damaged pid file', async () => {
      await cleanWith(String(process.pid));
      await cleanWith('not json');
      expect(alive(process.pid)).toBe(true);
    });
  });
});
