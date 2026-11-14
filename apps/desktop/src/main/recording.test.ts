// @vitest-environment node
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Library } from '@scrb/storage';
import type { FinalPassQueue } from '@scrb/app-core';
import { RecordingController, recoverInterrupted } from './recording.ts';
import type { LiveSetup } from './live-feed.ts';
import { ImportCoordinator } from './imports.ts';

// These tests exercise the Electron controller without launching a recording helper or using audio.
const fake = vi.hoisted(() => ({
  sealAudio: vi.fn(),
  spawnSync: vi.fn(),
  resolveSources: vi.fn(),
  switchSource: vi.fn(),
  sessions: [] as {
    end(reason: 'stopped' | 'pauseFailed' | 'workerFailed'): void;
    launchWorker(): void;
    trackMissing(track: 'microphone' | 'meeting'): void;
    state(status: 'recording' | 'paused', atNs: number | null): void;
  }[],
  workerEvents: [] as ((event: unknown) => void)[],
  adapterArgs: [] as { args: string[]; hasLiveDescriptor: boolean }[],
  prepareWindowsPipes: vi.fn(),
  windowsLaunches: 0,
}));

vi.mock('node:child_process', () => ({ spawnSync: fake.spawnSync }));
vi.mock('@scrb/app-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@scrb/app-core')>()),
  sealAudio: fake.sealAudio,
  RecordingSession: class {
    constructor(
      private readonly options: {
        launch: () => unknown;
        onStateChanged: (status: 'recording' | 'paused', reason: null, atNs: number | null) => void;
        onEnded: (reason: 'stopped' | 'pauseFailed' | 'workerFailed') => void;
        onTrackMissing: (track: 'microphone' | 'meeting') => void;
      },
    ) {
      fake.sessions.push(this);
    }

    launchWorker(): void {
      this.options.launch();
    }

    async start(): Promise<void> {
      this.options.launch();
      this.options.onStateChanged('recording', null, null);
    }

    trackMissing(track: 'microphone' | 'meeting'): void {
      this.options.onTrackMissing(track);
    }

    state(status: 'recording' | 'paused', atNs: number | null): void {
      this.options.onStateChanged(status, null, atNs);
    }

    async stop(): Promise<void> {
      this.end('stopped');
    }

    async switchSource(change: unknown): Promise<{ ok: boolean }> {
      return fake.switchSource(change);
    }

    end(reason: 'stopped' | 'pauseFailed' | 'workerFailed'): void {
      this.options.onEnded(reason);
    }
  },
}));
vi.mock('./live-feed.ts', () => ({
  LiveCaptureSession: class {
    async prepareWindowsPipes(): Promise<void> {
      fake.prepareWindowsPipes();
    }
    startWindowsHelper(): string[] {
      return ['--live-pipe', `invented-pipe-${++fake.windowsLaunches}`];
    }
    startHelper(): undefined {
      return undefined;
    }
    async stop(): Promise<void> {
      return undefined;
    }
  },
}));
vi.mock('@scrb/capture', () => ({
  ProcessAdapter: class {
    constructor(_helper: string, args: string[] = [], live?: unknown) {
      fake.adapterArgs.push({ args, hasLiveDescriptor: live !== undefined });
    }
    onEvent(listener: (event: unknown) => void): void {
      fake.workerEvents.push(listener);
    }
    onExit = vi.fn();
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

afterEach(() => {
  // The platform spy from the source-switch tests must not leak into the Windows launch test.
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  fake.sessions.length = 0;
  fake.workerEvents.length = 0;
  fake.adapterArgs.length = 0;
  fake.windowsLaunches = 0;
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

describe('A meeting track that hears nothing', () => {
  it('warns that the app is playing but the track is silent', async () => {
    const emit = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'capture-helper',
      emit,
      { read: () => ({ meetingAppId: 'msedge.exe', micDeviceId: null }), save: vi.fn() },
    );
    await controller.handlers.startRecording!({ title: 'silent' });
    fake.sessions[0]!.launchWorker();

    fake.workerEvents.at(-1)?.({ type: 'meetingSilent' });

    expect(emit).toHaveBeenCalledWith(
      'recordingHealth',
      expect.objectContaining({
        level: 'warning',
        warnings: [
          expect.objectContaining({
            kind: 'audioMissing',
            track: 'meeting',
            message: expect.stringContaining('Whole computer audio'),
          }),
        ],
      }),
    );
    await controller.shutdown();
  });
});

describe('Start while the previous recording is finishing', () => {
  it('blocks imports until preemption completes', async () => {
    const library = libraryStub();
    let release!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      release = resolve;
    });
    const controller = new RecordingController(
      library as unknown as Library,
      'capture-helper',
      vi.fn(),
      { read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }), save: vi.fn() },
      null,
      undefined,
      null,
      () => cleanup,
    );
    const run = vi.fn();
    const imports = new ImportCoordinator({
      library: library as unknown as Library,
      chooseFile: async () => null,
      run,
      recordingBusy: () => controller.isBusy(),
      privacyBanner: async () => false,
      emit: vi.fn(),
    });
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: NS_PER_MS });
    const start = controller.handlers.startRecording!({});
    try {
      expect(controller.isBusy()).toBe(true);
      await expect(
        imports.handlers.importAudioFile!({ fileToken: 'unused', buildVoiceProfiles: false }),
      ).rejects.toMatchObject({ code: 'conflict' });
      await expect(controller.handlers.startRecording!({})).rejects.toMatchObject({
        code: 'conflict',
      });
      expect(fake.resolveSources).not.toHaveBeenCalled();
      expect(library.createMeeting).not.toHaveBeenCalled();
      expect(fake.adapterArgs).toEqual([]);
      expect(run).not.toHaveBeenCalled();
      release();
      await expect(start).resolves.toEqual({ meetingId: 'meeting-1' });
      expect(fake.adapterArgs).toHaveLength(1);
    } finally {
      release();
      await start;
      await controller.shutdown();
      await imports.shutdown();
    }
    expect(controller.isBusy()).toBe(false);
  });

  it('releases Start after preemption fails', async () => {
    const library = libraryStub();
    const preempt = vi
      .fn()
      .mockRejectedValueOnce(new Error('cleanup failed'))
      .mockResolvedValue(undefined);
    const controller = new RecordingController(
      library as unknown as Library,
      'capture-helper',
      vi.fn(),
      { read: () => ({ meetingAppId: 'whole-computer', micDeviceId: null }), save: vi.fn() },
      null,
      undefined,
      null,
      preempt,
    );
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: NS_PER_MS });
    await expect(controller.handlers.startRecording!({})).rejects.toThrow('cleanup failed');
    expect(controller.isBusy()).toBe(false);
    expect(library.createMeeting).not.toHaveBeenCalled();
    expect(fake.adapterArgs).toEqual([]);
    expect(await controller.handlers.getRecordingSnapshot!(undefined)).toMatchObject({
      state: { status: 'idle' },
    });
    try {
      await expect(controller.handlers.startRecording!({})).resolves.toEqual({
        meetingId: 'meeting-1',
      });
    } finally {
      await controller.shutdown();
    }
  });

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

  it('keeps one warning per lost track and clears it when access returns', async () => {
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
    const last = () =>
      emit.mock.calls.filter(([name]) => name === 'recordingHealth').at(-1)?.[1] as {
        level: string;
        warnings: { kind: string; track?: string }[];
      };
    send({ type: 'permissionLost', track: 'microphone' });
    send({ type: 'permissionLost', track: 'microphone' });
    expect(last().warnings).toHaveLength(1);
    expect(last().level).toBe('warning');

    // A reopen while blocked must not clear it.
    send({ type: 'streamReopened', track: 'microphone' });
    expect(last().warnings).toHaveLength(1);

    send({ type: 'permissionRestored', track: 'microphone' });
    expect(last()).toMatchObject({ level: 'ok', warnings: [] });

    send({ type: 'permissionLost', track: 'microphone' });
    expect(last().warnings).toMatchObject([{ kind: 'permissionLost', track: 'microphone' }]);
    await controller.shutdown();
  });

  it('clears the missing-microphone start warning when the microphone reopens', async () => {
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
    const last = () =>
      emit.mock.calls.filter(([name]) => name === 'recordingHealth').at(-1)?.[1] as {
        level: string;
        warnings: { kind: string; track?: string; message: string }[];
      };
    send({ type: 'writeError', track: 'meeting' });
    fake.sessions[0]!.trackMissing('microphone');
    expect(last().warnings).toHaveLength(2);
    send({ type: 'streamReopened', track: 'microphone' });
    expect(last().warnings).toMatchObject([{ kind: 'audioMissing', track: 'meeting' }]);
    expect(last().warnings).toHaveLength(1);
    expect(last().level).toBe('failed');
    await controller.shutdown();
  });

  it('clears only the recovered warning and keeps unrelated ones', async () => {
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
    send({ type: 'writeError', track: 'meeting' });
    send({ type: 'permissionLost', track: 'microphone' });
    send({ type: 'streamDead', track: 'microphone', message: 'x' });
    send({ type: 'permissionRestored', track: 'microphone' });
    send({ type: 'streamReopened', track: 'microphone' });
    const health = emit.mock.calls.filter(([name]) => name === 'recordingHealth').at(-1)?.[1];
    expect(health).toMatchObject({
      level: 'failed',
      warnings: [{ kind: 'audioMissing', track: 'meeting' }],
    });
    expect(health.warnings).toHaveLength(1);
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

    expect(
      ((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] })
        .pauseSpans,
    ).toEqual([{ startMs: 1501.125, endMs: 3003.25, reason: 'user' }]);
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
    expect(
      ((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] })
        .pauseSpans,
    ).toHaveLength(1);
    await controller.shutdown();
    expect(
      ((await controller.handlers.getRecordingSnapshot!({})) as { pauseSpans: unknown[] })
        .pauseSpans,
    ).toEqual([]);
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

  it('warns once while a stream stays dead, clears on reopen, and warns again if it dies after', async () => {
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
    send({ type: 'streamDead', track: 'meeting' });
    send({ type: 'streamDead', track: 'meeting' });
    send({ type: 'streamReopened', track: 'meeting' });
    send({ type: 'serviceRestarted', track: 'meeting' });

    const health = emit.mock.calls.filter(([name]) => name === 'recordingHealth');
    // Dead (one warning), reopened (cleared), dead again (one warning).
    expect(health).toHaveLength(3);
    expect(health.at(-1)?.[1]).toMatchObject({
      level: 'warning',
      warnings: [{ kind: 'audioMissing', track: 'meeting' }],
    });
    expect(health.at(-1)?.[1].warnings).toHaveLength(1);
    await controller.shutdown();
  });
});

describe('Changing sources during a recording', () => {
  const saved = { meetingAppId: 'app.old', micDeviceId: 'mic-old' };

  async function recording(platform: NodeJS.Platform = 'darwin') {
    vi.spyOn(process, 'platform', 'get').mockReturnValue(platform);
    const emit = vi.fn();
    const save = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'helper',
      emit,
      { read: () => saved, save },
    );
    await controller.handlers.startRecording!({});
    const select = (selection: unknown) => controller.handlers.selectSources!(selection);
    return { controller, emit, save, select };
  }

  const resolved = (over: object) =>
    fake.resolveSources.mockResolvedValue({
      source: 'wholeComputer',
      mic: 'mic-new',
      micFellBack: false,
      ...over,
    });

  it('switches the microphone, saves it only after the ack, and notes it as information', async () => {
    const { controller, emit, save, select } = await recording();
    resolved({});
    fake.switchSource.mockResolvedValue({ ok: true });
    await select({ ...saved, micDeviceId: 'mic-new' });
    expect(fake.switchSource).toHaveBeenCalledWith({ mic: 'mic-new' });
    expect(save).toHaveBeenCalledWith({ ...saved, micDeviceId: 'mic-new' });
    const health = emit.mock.calls.filter(([name]) => name === 'recordingHealth').at(-1)![1];
    expect(health).toMatchObject({ level: 'ok', warnings: [{ kind: 'deviceChanged' }] });
    await controller.shutdown();
  });

  it('switches the meeting app and sends its process IDs', async () => {
    const { controller, save, select } = await recording();
    resolved({ source: [7, 8] });
    fake.switchSource.mockResolvedValue({ ok: true });
    await select({ ...saved, meetingAppId: 'app.new' });
    expect(fake.switchSource).toHaveBeenCalledWith({ source: [7, 8] });
    expect(save).toHaveBeenCalled();
    await controller.shutdown();
  });

  it('does not save and says so when the helper rolls back', async () => {
    const { controller, save, emit, select } = await recording();
    resolved({});
    fake.switchSource.mockResolvedValue({ ok: false });
    await expect(select({ ...saved, micDeviceId: 'mic-new' })).rejects.toThrow(
      'Still recording with the previous one',
    );
    expect(save).not.toHaveBeenCalled();
    expect(emit.mock.calls.some(([name]) => name === 'recordingHealth')).toBe(false);
    await controller.shutdown();
  });

  it('does not save when the command itself fails', async () => {
    const { controller, save, select } = await recording();
    resolved({});
    fake.switchSource.mockRejectedValue(new Error('The capture worker stopped.'));
    await expect(select({ ...saved, micDeviceId: 'mic-new' })).rejects.toThrow('Could not switch');
    expect(save).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('rejects a missing microphone and an app with no audio process before sending anything', async () => {
    const { controller, save, select } = await recording();
    resolved({ micFellBack: true, mic: 'default' });
    await expect(select({ ...saved, micDeviceId: 'gone' })).rejects.toThrow('not available');
    resolved({ source: [-1] });
    await expect(select({ ...saved, meetingAppId: 'quiet' })).rejects.toThrow('not playing audio');
    expect(fake.switchSource).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('rejects a request that changes both fields before resolving or sending', async () => {
    const { controller, save, select } = await recording();
    fake.resolveSources.mockClear();
    await expect(select({ meetingAppId: 'app.new', micDeviceId: 'mic-new' })).rejects.toThrow(
      'one at a time',
    );
    expect(fake.resolveSources).not.toHaveBeenCalled();
    expect(fake.switchSource).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('does nothing for an unchanged selection', async () => {
    const { controller, save, select } = await recording();
    await select(saved);
    expect(fake.switchSource).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('refuses on Windows', async () => {
    const { controller, save, select } = await recording('win32');
    await expect(select({ ...saved, micDeviceId: 'mic-new' })).rejects.toThrow(
      'Stop the recording',
    );
    expect(fake.switchSource).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    await controller.shutdown();
  });

  it('refuses a second switch while one is in flight', async () => {
    const { controller, select } = await recording();
    resolved({});
    let finish!: (ack: { ok: boolean }) => void;
    fake.switchSource.mockReturnValue(new Promise((done) => (finish = done)));
    const first = select({ ...saved, micDeviceId: 'mic-new' });
    await vi.waitFor(() => expect(fake.switchSource).toHaveBeenCalled());
    await expect(select({ ...saved, micDeviceId: 'mic-3' })).rejects.toThrow('Still switching');
    finish({ ok: true });
    await first;
    await controller.shutdown();
  });

  it('saves the choice while idle', async () => {
    const save = vi.fn();
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'helper',
      vi.fn(),
      { read: () => saved, save },
    );
    await controller.handlers.selectSources!({ ...saved, micDeviceId: null });
    expect(save).toHaveBeenCalled();
  });
});

describe('Windows desktop live helper launch', () => {
  it.skipIf(process.platform !== 'win32')('uses a fresh pipe for helper restart', async () => {
    fake.sealAudio.mockResolvedValue({ outcome: 'ready', endNs: 0 });
    const controller = new RecordingController(
      libraryStub() as unknown as Library,
      'capture-helper',
      vi.fn(),
      { read: () => ({ meetingAppId: 'wholeComputer', micDeviceId: null }), save: vi.fn() },
      null,
      async () => false,
      {} as LiveSetup,
    );

    await controller.handlers.startRecording!({});
    expect(fake.prepareWindowsPipes).toHaveBeenCalledOnce();
    expect(fake.adapterArgs[0]).toEqual({
      args: ['--live-pipe', 'invented-pipe-1'],
      hasLiveDescriptor: false,
    });
    fake.sessions[0]!.launchWorker();
    expect(fake.adapterArgs[1]).toEqual({
      args: ['--live-pipe', 'invented-pipe-2'],
      hasLiveDescriptor: false,
    });
    await controller.shutdown();
  });
});
