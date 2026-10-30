import { ContractError, type PauseReason, type RecordingStatus } from '@scrb/contracts';
import {
  TRACKS,
  type OpenCommand,
  type CaptureAck,
  type CaptureAdapter,
  type CaptureCommand,
  type Track,
} from '@scrb/capture';

/** Pause must be confirmed in this time. Above it, the privacy promise cannot be shown to hold. */
export const COMMAND_TIMEOUT_MS = 200;
export const MAX_WORKER_RESTARTS = 3;

export type SessionEnd = 'stopped' | 'pauseFailed' | 'workerFailed';

export interface RecordingSessionOptions {
  /** Starts a worker. Called again for each restart in the same meeting. */
  launch(): CaptureAdapter;
  onStateChanged(status: RecordingStatus, pauseReason: PauseReason | null): void;
  onTrackMissing(track: Track): void;
  onEnded(end: SessionEnd): void;
  newCommandId(): string;
  timeoutMs?: number;
}

const conflict = (message: string) => new ContractError({ code: 'conflict', message });

/**
 * One recording's state machine. Paused always means the worker confirmed a closed gate, and
 * Recording means it confirmed an open one. See `docs/plans/pause-resume.md`.
 */
export class RecordingSession {
  private status: RecordingStatus = 'idle';
  private pauseReason: PauseReason | null = null;
  private adapter: CaptureAdapter | null = null;
  private restarts = 0;
  /** Set before a deliberate kill, so its exit is never taken for a crash. */
  private ending = false;
  private pending: 'pausing' | 'resuming' | null = null;
  private openCommand: OpenCommand | null = null;

  constructor(private readonly options: RecordingSessionOptions) {}

  get state(): { status: RecordingStatus; pauseReason: PauseReason | null } {
    return { status: this.status, pauseReason: this.pauseReason };
  }

  async start(open: OpenCommand): Promise<void> {
    if (this.status !== 'idle') throw conflict('A recording is already running.');
    this.setStatus('starting');
    this.ending = false;
    this.restarts = 0;
    this.openCommand = open;
    this.attach();
    const permission = await this.send({ name: 'checkPermission' });
    if (permission.systemAudio === 'denied') this.options.onTrackMissing('meeting');
    await this.require(open);
    const ack = await this.require({ name: 'start' });
    this.reportMissing(ack);
    this.setStatus('recording');
  }

  async pause(reason: PauseReason = 'user'): Promise<void> {
    if (this.status !== 'recording' || this.pending) throw conflict('Not recording.');
    this.pending = 'pausing';
    try {
      const ack = await this.confirmPause();
      if (this.ending) return;
      if (ack?.gate !== 'closed') return this.failPause();
      this.pauseReason = reason;
      this.setStatus('paused');
    } finally {
      this.pending = null;
    }
  }

  /** One retry with the same ID: a lost reply is not a failed pause. */
  private async confirmPause(): Promise<CaptureAck | null> {
    const id = this.options.newCommandId();
    return (
      (await this.withTimeout(id, { name: 'pause' })) ??
      (await this.withTimeout(id, { name: 'pause' }))
    );
  }

  /** Stops all capture. The kill is flagged first, so no restart can reopen the streams. */
  private failPause(): void {
    this.ending = true;
    this.adapter?.kill();
    this.finish('pauseFailed');
  }

  async resume(): Promise<void> {
    if (this.status !== 'paused' || this.pending) throw conflict('Not paused.');
    this.pending = 'resuming';
    try {
      const ack = await this.send({ name: 'resume' });
      if (this.ending) return;
      if (!ack.ok || ack.gate !== 'open' || ack.activeTracks.length === 0) {
        throw new ContractError({ code: 'internal', message: 'Recording could not resume.' });
      }
      this.reportMissing(ack);
      this.pauseReason = null;
      this.setStatus('recording');
    } finally {
      this.pending = null;
    }
  }

  /** Allowed in any active state, including during a pause or resume. */
  async stop(): Promise<void> {
    if (this.status === 'idle' || this.status === 'stopping') return;
    this.ending = true;
    this.setStatus('stopping');
    await this.send({ name: 'stop' });
    this.finish('stopped');
  }

  private attach(): void {
    const adapter = this.options.launch();
    this.adapter = adapter;
    adapter.onExit(() => void this.workerExited());
  }

  private async workerExited(): Promise<void> {
    if (this.ending || this.status === 'idle') return;
    if (this.restarts >= MAX_WORKER_RESTARTS) return this.finish('workerFailed');
    this.restarts += 1;
    this.attach();
    await this.send(this.openCommand as OpenCommand);
    // A restart during a pause stays paused: the gate only opens on Resume.
    if (this.status === 'recording') this.reportMissing(await this.send({ name: 'start' }));
  }

  private reportMissing(ack: CaptureAck): void {
    for (const track of TRACKS) {
      if (!ack.activeTracks.includes(track)) this.options.onTrackMissing(track);
    }
  }

  private finish(end: SessionEnd): void {
    this.adapter = null;
    this.pauseReason = null;
    this.setStatus('idle');
    this.options.onEnded(end);
  }

  private setStatus(status: RecordingStatus): void {
    this.status = status;
    this.options.onStateChanged(status, this.pauseReason);
  }

  private send(command: CaptureCommand): Promise<CaptureAck> {
    const adapter = this.adapter;
    if (!adapter) throw conflict('No recording is running.');
    return adapter.send(this.options.newCommandId(), command);
  }

  private async require(command: CaptureCommand): Promise<CaptureAck> {
    const ack = await this.send(command);
    if (ack.ok && (command.name === 'open' || ack.activeTracks.length > 0)) return ack;
    this.ending = true;
    this.adapter?.kill();
    this.adapter = null;
    this.setStatus('idle');
    throw new ContractError({
      code: 'internal',
      message: ack.error ?? 'Recording could not start.',
    });
  }

  private async withTimeout(id: string, command: CaptureCommand): Promise<CaptureAck | null> {
    const adapter = this.adapter;
    if (!adapter) return null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), this.options.timeoutMs ?? COMMAND_TIMEOUT_MS);
    });
    const ack = await Promise.race([adapter.send(id, command), timedOut]);
    clearTimeout(timer);
    return ack;
  }
}
