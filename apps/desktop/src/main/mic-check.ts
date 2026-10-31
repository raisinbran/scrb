import { randomUUID } from 'node:crypto';
import { ProcessAdapter, type CaptureAdapter } from '@scrb/capture';
import {
  ContractError,
  type AudioCheckStatus,
  type BackendEvents,
  type EventName,
  type InputDevice,
  type SourceSelection,
} from '@scrb/contracts';
import { listInputDevices } from './sources.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
const MAX_CHECK_MS = 120_000;
const OPEN_TIMEOUT_MS = 5_000;

/** Owns a separate read-only mic helper; never calls the recording helper's open command. */
export class MicCheckController {
  private probe: CaptureAdapter | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private opening = false;
  private serial = 0;
  private lastDevice: InputDevice | null = null;
  private status: AudioCheckStatus = {
    active: false,
    micDevice: null,
    micResult: 'noSignal',
    meetingResult: 'notChecked',
  };

  constructor(
    private readonly helper: string,
    private readonly emit: Emit,
    private readonly recordingBusy: () => boolean,
    private readonly launch: () => CaptureAdapter = () =>
      new ProcessAdapter(helper, ['--mic-probe']),
    private readonly devices: () => Promise<InputDevice[]> = () => listInputDevices(helper),
  ) {}

  async start(sources: SourceSelection): Promise<void> {
    if (this.recordingBusy()) {
      throw new ContractError({ code: 'conflict', message: 'Stop recording to test the microphone.' });
    }
    if (this.probe || this.opening) return;
    const serial = ++this.serial;
    this.opening = true;
    try {
      const devices = await this.devices();
      if (serial !== this.serial || this.recordingBusy()) return;
      const micDevice =
        (sources.micDeviceId
          ? devices.find((item) => item.id === sources.micDeviceId)
          : devices.find((item) => item.isSystemDefault)) ?? null;
      this.lastDevice = micDevice;
      const probe = this.launch();
      this.probe = probe;
      const status: AudioCheckStatus = {
        active: true,
        micDevice,
        micResult: 'listening',
        meetingResult: 'notChecked',
      };
      this.status = status;
      this.emit('audioCheck', status);
      probe.onEvent((event) => {
        if (this.probe !== probe) return;
        if (event.type === 'micCheckEnded') {
          this.stop(event.reason);
          return;
        }
        if (event.type !== 'micLevel') return;
        const micDb = Math.max(-100, Math.min(0, event.micDb));
        this.status = {
          ...this.status,
          micResult: micDb > -45 ? 'hearing' : micDb > -75 ? 'quiet' : 'noSignal',
        };
        this.emit('audioCheck', this.status);
        this.emit('levelMeter', { micDb, meetingDb: null });
      });
      let exited!: () => void;
      const exit = new Promise<'exited'>((resolve) => {
        exited = () => resolve('exited');
      });
      probe.onExit(() => {
        exited();
        if (this.probe === probe) this.stop('deviceLost');
      });
      let expired!: () => void;
      const timeout = new Promise<'timeout'>((resolve) => {
        expired = () => resolve('timeout');
      });
      const openTimer = setTimeout(expired, OPEN_TIMEOUT_MS);
      const ack = await Promise.race([
        probe.send(randomUUID(), { name: 'beginMicCheck', mic: sources.micDeviceId ?? 'default' }),
        exit,
        timeout,
      ]);
      clearTimeout(openTimer);
      if (this.probe !== probe) return;
      if (ack === 'timeout' || ack === 'exited' || !ack.ok) {
        this.status = { ...this.status, micResult: ack !== 'timeout' && ack !== 'exited' ? 'denied' : 'noSignal' };
        this.stop('deviceLost');
        throw new ContractError({
          code: ack !== 'timeout' && ack !== 'exited' ? 'permissionDenied' : 'internal',
          message: 'The microphone test could not open the selected device.',
        });
      }
      this.timer = setTimeout(() => this.stop('timedOut'), MAX_CHECK_MS);
    } finally {
      if (serial === this.serial) this.opening = false;
    }
  }

  /** Synchronous kill means Start never waits for the probe to acknowledge shutdown. */
  stop(reason: NonNullable<AudioCheckStatus['endReason']>): void {
    ++this.serial;
    const probe = this.probe;
    this.probe = null;
    this.opening = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!probe) return;
    probe.kill();
    this.status = {
      active: false,
      micDevice: this.lastDevice,
      micResult: this.status.micResult,
      meetingResult: 'notChecked',
      endReason: reason,
    };
    this.emit('audioCheck', this.status);
  }
}
