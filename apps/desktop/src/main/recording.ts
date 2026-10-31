import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RecordingSession, sealAudio, type FinalPassQueue, type SessionEnd } from '@scrb/app-core';
import { ProcessAdapter } from '@scrb/capture';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type RecordingHealth,
  type RecordingSnapshot,
  type RecordingState,
  type RecordingWarning,
  type SourceSelection,
} from '@scrb/contracts';
import { errorFields, type Library } from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';
import { listInputDevices, listMeetingApps, resolveSources } from './sources.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

const IDLE: RecordingState = {
  status: 'idle',
  meetingId: null,
  elapsedMs: 0,
  pauseReason: null,
  privacyBannerRequired: false,
};

function lockHeld(helper: string, lock: string): boolean {
  return spawnSync(helper, ['check-lock', lock]).status === 3;
}

/**
 * Finishes any recording a crash left open. Runs at launch, before the window appears. A recording
 * that stopped cleanly but was cut off before its pass gets the pass now.
 */
export async function recoverInterrupted(
  library: Library,
  helper: string,
  finalPasses: FinalPassQueue | null = null,
): Promise<void> {
  for (const meetingId of library.openReport.interruptedRecordings) {
    const audio = library.meetingPaths(meetingId).audio;
    const sealed = await sealAudio(audio, async () => lockHeld(helper, join(audio, 'writer.lock')));
    if (sealed.outcome === 'writerAlive') continue;
    const transcribe = sealed.outcome === 'ready' && finalPasses !== null;
    await library.updateMeeting(meetingId, {
      status: transcribe ? 'finalPassRunning' : sealed.outcome,
      durationMs: Math.round(sealed.endNs / 1e6),
    });
    if (transcribe) finalPasses.enqueue(meetingId);
  }
}

/** Where the chosen sources live, so the Settings screen and the Live pickers share one choice. */
export interface SourceStore {
  read(): SourceSelection;
  save(selection: SourceSelection): void;
}

/** Runs real recordings for the UI. One recording at a time. */
export class RecordingController {
  private state: RecordingState = IDLE;
  private health: RecordingHealth | null = null;
  private session: RecordingSession | null = null;
  private starting = false;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;
  private finishing: Promise<void> | null = null;

  constructor(
    private readonly library: Library,
    private readonly helper: string,
    private readonly emit: Emit,
    private readonly sources: SourceStore,
    /** Null leaves a stopped meeting ready with no transcript. */
    private readonly finalPasses: FinalPassQueue | null = null,
    private readonly shouldShowPrivacyBanner: () => Promise<boolean> = async () => false,
  ) {}

  private update(patch: Partial<RecordingState>): void {
    this.state = { ...this.state, ...patch };
    this.emit('recordingStateChanged', this.state);
  }

  private warn(warning: Omit<RecordingWarning, 'atMs'>, level: RecordingHealth['level']): void {
    const warnings = [...(this.health?.warnings ?? []), { ...warning, atMs: this.state.elapsedMs }];
    this.health = { level, warnings, diskFreeBytes: this.health?.diskFreeBytes ?? 0 };
    this.emit('recordingHealth', this.health);
  }

  private tick(): void {
    const now = Date.now();
    if (this.state.status === 'recording') {
      this.update({ elapsedMs: this.state.elapsedMs + (now - this.lastTick) });
    }
    this.lastTick = now;
  }

  private async finish(meetingId: string, end: SessionEnd): Promise<void> {
    clearInterval(this.ticker);
    this.session = null;
    const audio = this.library.meetingPaths(meetingId).audio;
    const sealed = await sealAudio(audio, async () =>
      lockHeld(this.helper, join(audio, 'writer.lock')),
    );
    const clean = end === 'stopped' && sealed.outcome === 'ready';
    const transcribe = clean && this.finalPasses !== null;
    await this.library.updateMeeting(meetingId, {
      status: transcribe ? 'finalPassRunning' : clean ? 'ready' : 'recovered',
      durationMs: Math.round(sealed.endNs / 1e6),
    });
    if (end === 'pauseFailed') {
      this.warn(
        {
          kind: 'pauseFailed',
          message:
            'The pause could not be confirmed, so the recording ended. Audio before it is saved.',
        },
        'failed',
      );
    } else if (end === 'workerFailed') {
      this.warn(
        { kind: 'audioMissing', message: 'Recording stopped because capture kept failing.' },
        'failed',
      );
    }
    this.update(IDLE);
    if (transcribe) this.finalPasses?.enqueue(meetingId);
  }

  private start = async ({ title }: { title?: string }): Promise<{ meetingId: string }> => {
    if (this.session || this.starting || this.finishing) {
      throw new ContractError({ code: 'conflict', message: 'A recording is already running.' });
    }
    this.starting = true;
    try {
      return await this.begin(title);
    } catch (failure) {
      this.session = null;
      this.update(IDLE);
      throw failure;
    } finally {
      this.starting = false;
    }
  };

  private async begin(title: string | undefined): Promise<{ meetingId: string }> {
    const { source, mic, micFellBack } = await resolveSources(this.helper, this.sources.read());
    const meeting = await this.library.createMeeting({
      title: title ?? 'Meeting',
      source: 'recorded',
      status: 'recording',
    });
    this.health = { level: 'ok', warnings: [], diskFreeBytes: 0 };
    this.state = { ...IDLE, meetingId: meeting.id,
      privacyBannerRequired: await this.shouldShowPrivacyBanner().catch(() => true),
    };
    if (micFellBack) {
      this.warn(
        {
          kind: 'deviceChanged',
          track: 'microphone',
          message: 'The chosen microphone is not connected, so the system default is recording.',
        },
        'warning',
      );
    }
    const session = new RecordingSession({
      launch: () => {
        const adapter = new ProcessAdapter(this.helper);
        adapter.onEvent((event) => {
          if (event.type === 'health') {
            this.emit('levelMeter', { micDb: event.micDb, meetingDb: event.meetingDb });
          }
        });
        return adapter;
      },
      onStateChanged: (status, pauseReason) => {
        if (status !== 'idle') this.update({ status, pauseReason });
      },
      onTrackMissing: (track) =>
        this.warn(
          { kind: 'audioMissing', track, message: `The ${track} track is not recording.` },
          'warning',
        ),
      onEnded: (end) => {
        this.finishing = this.finish(meeting.id, end)
          .catch((error: unknown) => {
            this.library.logger.log('error', 'recording-finish-failed', errorFields(error));
          })
          .finally(() => {
            this.finishing = null;
          });
      },
      newCommandId: randomUUID,
    });
    this.session = session;
    try {
      await session.start({
        name: 'open',
        sessionId: meeting.id,
        outputDir: dirname(this.library.meetingPaths(meeting.id).audio),
        source,
        mic,
      });
    } catch (failure) {
      if (this.session === session) await this.closeFailedStart(meeting.id);
      throw failure;
    }
    this.lastTick = Date.now();
    this.ticker = setInterval(() => this.tick(), 1000);
    return { meetingId: meeting.id };
  }

  /** A meeting with no audio stays listed as recovered, so nothing a worker saved is lost. */
  private async closeFailedStart(meetingId: string): Promise<void> {
    const audio = this.library.meetingPaths(meetingId).audio;
    const sealed = await sealAudio(audio, async () =>
      lockHeld(this.helper, join(audio, 'writer.lock')),
    );
    // A worker still holding the lock leaves this row for recovery at the next launch.
    if (sealed.outcome === 'writerAlive') return;
    await this.library.updateMeeting(meetingId, {
      status: sealed.outcome,
      durationMs: Math.round(sealed.endNs / 1e6),
    });
  }

  /** The helper cannot switch sources mid-recording, so a change waits for Stop. */
  private select = async (selection: SourceSelection): Promise<void> => {
    const current = this.sources.read();
    const changed =
      selection.micDeviceId !== current.micDeviceId ||
      selection.meetingAppId !== current.meetingAppId;
    if (changed && (this.session || this.starting)) {
      throw new ContractError({
        code: 'conflict',
        message: 'Stop the recording to change the meeting app or microphone.',
      });
    }
    this.sources.save(selection);
  };

  private snapshot = async (): Promise<RecordingSnapshot> => ({
    state: this.state,
    health: this.health,
    transcription: null,
  });

  private require(): RecordingSession {
    if (!this.session) throw new ContractError({ code: 'conflict', message: 'Not recording.' });
    return this.session;
  }

  get handlers(): CallHandlers {
    return {
      startRecording: (request) => this.start(request as { title?: string }),
      pauseRecording: () => this.require().pause(),
      resumeRecording: () => this.require().resume(),
      stopRecording: () => this.require().stop(),
      getRecordingSnapshot: this.snapshot,
      listInputDevices: () => listInputDevices(this.helper),
      listMeetingApps: () => listMeetingApps(this.helper, this.sources.read().meetingAppId),
      selectSources: (request) => this.select(request as SourceSelection),
    };
  }

  /** Quitting mid-recording stops it cleanly rather than leaving it to recovery. */
  async shutdown(): Promise<void> {
    await this.session?.stop();
    await this.finishing;
  }
}
