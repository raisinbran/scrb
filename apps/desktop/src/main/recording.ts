import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { RecordingSession, sealAudio, type SessionEnd } from '@scrb/app-core';
import { ProcessAdapter } from '@scrb/capture';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type RecordingHealth,
  type RecordingSnapshot,
  type RecordingState,
  type RecordingWarning,
} from '@scrb/contracts';
import type { Library } from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';

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

/** Finishes any recording a crash left open. Runs at launch, before the window appears. */
export async function recoverInterrupted(library: Library, helper: string): Promise<void> {
  for (const meetingId of library.openReport.interruptedRecordings) {
    const audio = library.meetingPaths(meetingId).audio;
    const sealed = await sealAudio(audio, async () => lockHeld(helper, join(audio, 'writer.lock')));
    if (sealed.outcome === 'writerAlive') continue;
    await library.updateMeeting(meetingId, {
      status: sealed.outcome,
      durationMs: Math.round(sealed.endNs / 1e6),
    });
  }
}

/** Runs real recordings for the UI. One recording at a time. */
export class RecordingController {
  private state: RecordingState = IDLE;
  private health: RecordingHealth | null = null;
  private session: RecordingSession | null = null;
  private ticker: ReturnType<typeof setInterval> | undefined;
  private lastTick = 0;

  constructor(
    private readonly library: Library,
    private readonly helper: string,
    private readonly emit: Emit,
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
    await this.library.updateMeeting(meetingId, {
      status: end === 'stopped' && sealed.outcome === 'ready' ? 'ready' : 'recovered',
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
  }

  private start = async ({ title }: { title?: string }): Promise<{ meetingId: string }> => {
    if (this.session) {
      throw new ContractError({ code: 'conflict', message: 'A recording is already running.' });
    }
    const meeting = await this.library.createMeeting({
      title: title ?? 'Meeting',
      source: 'recorded',
      status: 'recording',
    });
    this.health = { level: 'ok', warnings: [], diskFreeBytes: 0 };
    this.state = { ...IDLE, meetingId: meeting.id };
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
      onEnded: (end) => void this.finish(meeting.id, end),
      newCommandId: randomUUID,
    });
    this.session = session;
    await session.start({
      name: 'open',
      sessionId: meeting.id,
      outputDir: dirname(this.library.meetingPaths(meeting.id).audio),
      source: 'wholeComputer',
      mic: 'default',
    });
    this.lastTick = Date.now();
    this.ticker = setInterval(() => this.tick(), 1000);
    return { meetingId: meeting.id };
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
    };
  }

  /** Quitting mid-recording stops it cleanly rather than leaving it to recovery. */
  async shutdown(): Promise<void> {
    await this.session?.stop();
  }
}
