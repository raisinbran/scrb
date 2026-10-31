// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureAck, CaptureAdapter, CaptureCommand, CaptureEvent } from '@scrb/capture';
import type { BackendEvents, EventName, SourceSelection } from '@scrb/contracts';
import { MicCheckController } from './mic-check.ts';

const sources: SourceSelection = { meetingAppId: 'whole-computer', micDeviceId: null };
const selectedDevice = { id: 'synthetic-mic', name: 'Invented mic', isSystemDefault: true, transport: 'usb' as const };

class FakeProbe implements CaptureAdapter {
  private listener: (event: CaptureEvent) => void = () => undefined;
  private onExited: () => void = () => undefined;
  readonly commands: CaptureCommand[] = [];
  killed = false;
  accepted = true;
  failureReason = 'permissionDenied';
  send(id: string, command: CaptureCommand): Promise<CaptureAck> {
    this.commands.push(command);
    return Promise.resolve({
      id, ok: this.accepted, gate: 'closed', atNs: null, activeTracks: [],
      ...(!this.accepted && { error: this.failureReason }),
    });
  }
  onEvent(listener: (event: CaptureEvent) => void): void { this.listener = listener; }
  onExit(listener: () => void): void { this.onExited = listener; }
  kill(): void { this.killed = true; }
  level(micDb: number): void { this.listener({ type: 'micLevel', micDb }); }
  exit(): void { this.onExited(); }
}

describe('mic check (T22, fake read-only helper)', () => {
  let busy: boolean;
  let probe: FakeProbe;
  let emit: ReturnType<typeof vi.fn>;
  let check: MicCheckController;

  beforeEach(() => {
    vi.useFakeTimers();
    busy = false;
    probe = new FakeProbe();
    emit = vi.fn();
    check = new MicCheckController(
      'invented-helper', emit as (<K extends EventName>(event: K, payload: BackendEvents[K]) => void),
      () => busy, () => probe,
      async () => [selectedDevice],
    );
  });
  afterEach(() => {
    check.stop('stopped');
    vi.useRealTimers();
  });

  it('opens mic-only mode, reports levels, and never calls open or creates a meeting', async () => {
    await check.start(sources);
    expect(probe.commands).toEqual([{ name: 'beginMicCheck', mic: 'default' }]);
    probe.level(-27);
    expect(emit).toHaveBeenCalledWith('levelMeter', { micDb: -27, meetingDb: null });
    expect(emit).toHaveBeenCalledWith('audioCheck', expect.objectContaining({
      active: true, micResult: 'hearing', micDevice: selectedDevice,
    }));
    check.stop('stopped');
    expect(probe.killed).toBe(true);
    expect(emit).toHaveBeenCalledWith('audioCheck', expect.objectContaining({
      active: false, endReason: 'stopped',
    }));
  });

  it('times out after exactly 120 seconds and closes once', async () => {
    await check.start(sources);
    await vi.advanceTimersByTimeAsync(119_999);
    expect(probe.killed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(probe.killed).toBe(true);
    expect(emit.mock.calls.filter(([name, value]) =>
      name === 'audioCheck' && (value as { active: boolean }).active === false)).toHaveLength(1);
  });

  it('refuses a check during recording and keeps the helper closed', async () => {
    busy = true;
    await expect(check.start(sources)).rejects.toMatchObject({ code: 'conflict' });
    expect(probe.commands).toEqual([]);
  });

  it('lets recording Start synchronously cancel a probe, including a late level', async () => {
    await check.start(sources);
    busy = true;
    check.stop('recordingStarted');
    probe.level(-20);
    expect(probe.killed).toBe(true);
    expect(emit).toHaveBeenCalledWith('audioCheck', expect.objectContaining({
      endReason: 'recordingStarted',
    }));
    expect(emit.mock.calls.filter(([name, value]) =>
      name === 'levelMeter' && (value as { micDb: number }).micDb === -20)).toHaveLength(0);
  });

  it('denied access never reports a successful check and releases the process', async () => {
    probe.accepted = false;
    await expect(check.start(sources)).rejects.toMatchObject({ code: 'permissionDenied' });
    expect(probe.killed).toBe(true);
    expect(emit).toHaveBeenCalledWith('audioCheck', expect.objectContaining({
      active: false, micResult: 'denied',
    }));
  });

  it('a disconnected mic does not falsely claim a privacy denial', async () => {
    probe.accepted = false;
    probe.failureReason = 'deviceLost';
    await expect(check.start(sources)).rejects.toMatchObject({ code: 'internal' });
    expect(emit).toHaveBeenCalledWith('audioCheck', expect.objectContaining({
      active: false, micResult: 'noSignal',
    }));
  });

  it('one helper exit ends the test, and Stop is idempotent', async () => {
    await check.start(sources);
    probe.exit();
    check.stop('stopped');
    expect(emit.mock.calls.filter(([name, value]) =>
      name === 'audioCheck' && (value as { endReason?: string }).endReason)).toHaveLength(1);
  });
});
