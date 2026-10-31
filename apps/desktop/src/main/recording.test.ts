// @vitest-environment node
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Library } from '@scrb/storage';
import type { FinalPassQueue } from '@scrb/app-core';
import { RecordingController, recoverInterrupted } from './recording.ts';

// These tests exercise the Electron controller without launching a recording helper or using audio.
const fake = vi.hoisted(() => ({
  sealAudio: vi.fn(),
  spawnSync: vi.fn(),
  resolveSources: vi.fn(),
  sessions: [] as {
    end(reason: 'stopped' | 'pauseFailed' | 'workerFailed'): void;
    state(status: 'recording' | 'paused', atNs: number | null): void;
  }[],
  workerEvents: [] as ((event: unknown) => void)[],
}));

vi.mock('node:child_process', () => ({ spawnSync: fake.spawnSync }));
vi.mock('@scrb/app-core', () => ({
  sealAudio: fake.sealAudio,
  RecordingSession: class {
    constructor(
      private readonly options: {
        launch: () => unknown;
        onStateChanged: (status: 'recording' | 'paused', reason: null, atNs: number | null) => void;
        onEnded: (reason: 'stopped' | 'pauseFailed' | 'workerFailed') => void;
      },
    ) {
      fake.sessions.push(this);
    }

    async start(): Promise<void> {
      this.options.launch();
      this.options.onStateChanged('recording', null, null);
    }

    state(status: 'recording' | 'paused', atNs: number | null): void {
      this.options.onStateChanged(status, null, atNs);
    }

    async stop(): Promise<void> {
      this.end('stopped');
    }

    end(reason: 'stopped' | 'pauseFailed' | 'workerFailed'): void {
      this.options.onEnded(reason);
    }
  },
}));
vi.mock('@scrb/capture', () => ({
  ProcessAdapter: class {
    onEvent(listener: (event: unknown) => void): void {
      fake.workerEvents.push(listener);
    }
  },
}));
vi.mock('./sources.ts', () => ({
  resolveSources: fake.resolveSources,
  listInputDevices: vi.fn(),
  listMeetingApps: vi.fn(),
}));

const NS_PER_MS = 1_000_000;

function libraryStub(interruptedRecordings: string[] = []) {
  let nextId = 0;
  const library = {
    openReport: { interruptedRecordings },
    meetingPaths: vi.fn((meetingId: string) => ({ audio: join('meetings', meetingId, 'audio') })),
    updateMeeting: vi.fn<(id: string, patch: unknown) => Promise<void>>(async () => undefined),
    createMeeting: vi.fn(async () => ({ id: `meeting-${++nextId}` })),
    logger: { log: vi.fn() },
  };
  return library;
}

function completion() {
  let resolve!: (value: { outcome: 'ready'; endNs: number }) => void;
  const promise = new Promise<{ outcome: 'ready'; endNs: number }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  fake.sessions.length = 0;
  fake.workerEvents.length = 0;
  fake.resolveSources.mockResolvedValue({
    source: 'wholeComputer',
    mic: 'default',
    micFellBack: false,
  });
  fake.spawnSync.mockReturnValue({ status: 0 });
});

describe('recoverInterrupted in the Electron controller', () => {
  it('does not seal or change a meeting whose writer lock is still held', async () => {
    const library = libraryStub(['recording-1']);
    fake.spawnSync.mockReturnValue({ status: 3 });
    fake.sealAudio.mockImplementation(
      async (_audio: string, writerAlive: () => Promise<boolean>) => {
        expect(await writerAlive()).toBe(true);
        return { outcome: 'writerAlive', endNs: 0 };
      },
    );

    await recoverInterrupted(library as unknown as Library, 'capture-helper');

    expect(fake.spawnSync).toHaveBeenCalledWith('capture-helper', [
      'check-lock',
      join('meetings', 'recording-1', 'audio', 'writer.lock'),
    ]);
    expect(library.updateMeeting).not.toHaveBeenCalled();
  });

  it.each([
    ['recovered', null, 'recovered'],
    ['ready', null, 'ready'],
    ['ready', 'queue', 'finalPassRunning'],
  ] as const)('seals %s with queue %s to %s', async (outcome, queueChoice, status) => {
    const library = libraryStub(['recording-2']);
    const enqueue = vi.fn();
    const queue = queueChoice === 'queue' ? ({ enqueue } as unknown as FinalPassQueue) : null;
    fake.sealAudio.mockImplementation(
      async (_audio: string, writerAlive: () => Promise<boolean>) => {
        expect(await writerAlive()).toBe(false);
        return { outcome, endNs: 7_500 * NS_PER_MS };
      },
    );

    await recoverInterrupted(library as unknown as Library, 'capture-helper', queue);

    expect(library.updateMeeting).toHaveBeenCalledTimes(1);
    expect(library.updateMeeting).toHaveBeenCalledWith('recording-2', {
      status,
      durationMs: 7_500,
    });
    expect(enqueue).toHaveBeenCalledTimes(queueChoice === 'queue' ? 1 : 0);
    if (queueChoice === 'queue') expect(enqueue).toHaveBeenCalledWith('recording-2');
  });

  it('queues the final pass only after the recovered status was saved', async () => {
    const library = libraryStub(['recording-3']);
    const save = completion();
    library.updateMeeting.mockImplementation(async () => {
      await save.promise;
    });
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: 5_000 * NS_PER_MS });
    const enqueue = vi.fn();

    const pending = recoverInterrupted(library as unknown as Library, 'capture-helper', {
      enqueue,
    } as unknown as FinalPassQueue);
    await vi.waitFor(() => expect(library.updateMeeting).toHaveBeenCalledTimes(1));
    expect(enqueue).not.toHaveBeenCalled();
    save.resolve({ outcome: 'ready', endNs: 0 });
    await pending;
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith('recording-3');
  });

  it('does not mark a meeting recovered when sealing fails', async () => {
    const library = libraryStub(['recording-4']);
    fake.sealAudio.mockRejectedValue(new Error('cannot read chunks'));
    await expect(
      recoverInterrupted(library as unknown as Library, 'capture-helper'),
    ).rejects.toThrow('cannot read chunks');
    expect(library.updateMeeting).not.toHaveBeenCalled();
  });
});

describe('Start while the previous recording is finishing', () => {
  it('refuses Start after onEnded clears the session but before Stop finishes sealing', async () => {
    const library = libraryStub();
    const sealing = completion();
    fake.sealAudio.mockReturnValueOnce(sealing.promise).mockResolvedValue({
      outcome: 'ready',
      endNs: 1_000 * NS_PER_MS,
    });
    const controller = new RecordingController(
      library as unknown as Library,
      'capture-helper',
      vi.fn(),
      { read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }), save: vi.fn() },
    );
    const start = controller.handlers.startRecording!;

    expect(await start({ title: 'first' })).toEqual({ meetingId: 'meeting-1' });
    fake.sessions[0]!.end('stopped');
    await vi.waitFor(() => expect(fake.sealAudio).toHaveBeenCalledTimes(1));

    await expect(start({ title: 'too early' })).rejects.toMatchObject({ code: 'conflict' });
    expect(library.createMeeting).toHaveBeenCalledTimes(1);
    expect(fake.resolveSources).toHaveBeenCalledTimes(1);

    sealing.resolve({ outcome: 'ready', endNs: 1_000 * NS_PER_MS });
    await vi.waitFor(() =>
      expect(library.updateMeeting).toHaveBeenCalledWith('meeting-1', {
        status: 'ready',
        durationMs: 1_000,
      }),
    );
    await vi.waitFor(async () => {
      expect(await start({ title: 'second' })).toEqual({ meetingId: 'meeting-2' });
    });
    expect(library.createMeeting).toHaveBeenCalledTimes(2);
    await controller.shutdown();
  });

  it('uses acknowledged session-clock nanoseconds for pause spans, not delayed wall time', async () => {
    const emit = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'helper',
      emit,
      { read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }), save: vi.fn() },
    );
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: 4_000_000_000 });
    await controller.handlers.startRecording!({});
    fake.sessions[0]!.state('paused', 1_501_125_000);
    fake.sessions[0]!.state('recording', 3_003_250_000);

    expect(((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] }).pauseSpans).toEqual([
      { startMs: 1501.125, endMs: 3003.25, reason: 'user' },
    ]);
    expect(emit).toHaveBeenCalledWith('pauseSpansChanged', {
      meetingId: 'meeting-1',
      spans: [{ startMs: 1501.125, endMs: 3003.25, reason: 'user' }],
    });
    await controller.shutdown();
  });

  it('clears confirmed pause spans after the recording becomes idle', async () => {
    const emit = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'helper',
      emit,
      { read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }), save: vi.fn() },
    );
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: 2_000_000_000 });
    await controller.handlers.startRecording!({});
    fake.sessions[0]!.state('paused', 1_000_000_000);
    expect(((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] }).pauseSpans).toHaveLength(1);
    await controller.shutdown();
    expect(((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] }).pauseSpans).toEqual([]);
    expect(emit).toHaveBeenCalledWith('pauseSpansChanged', {
      meetingId: 'meeting-1',
      spans: [],
    });
  });

  it('warns once per track on a write error and keeps the level meter', async () => {
    const emit = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'helper',
      emit,
      {
        read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }),
        save: vi.fn(),
      },
    );
    await controller.handlers.startRecording!({});
    const send = fake.workerEvents[0]!;
    send({ type: 'writeError', track: 'microphone', message: 'disk write failed' });
    send({ type: 'writeError', track: 'microphone', message: 'disk write failed' });
    send({ type: 'writeError', message: 'session.log write failed' });
    send({ type: 'health', micDb: -20, meetingDb: -30 });

    const health = emit.mock.calls.filter(([name]) => name === 'recordingHealth');
    expect(health).toHaveLength(2);
    expect(health.at(-1)?.[1]).toMatchObject({
      level: 'failed',
      warnings: [
        { kind: 'audioMissing', track: 'microphone' },
        { kind: 'audioMissing', message: 'Part of this recording could not be saved.' },
      ],
    });
    expect(emit).toHaveBeenCalledWith('levelMeter', { micDb: -20, meetingDb: -30 });
    await controller.shutdown();
  });
});
