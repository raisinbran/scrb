import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError } from '@scrb/contracts';
import type {
  CaptureAck,
  CaptureAdapter,
  CaptureCommand,
  OpenCommand,
  Track,
} from '@scrb/capture';
import { MAX_WORKER_RESTARTS, RecordingSession, type SessionEnd } from './recording.ts';

const OPEN = {
  name: 'open',
  sessionId: 's',
  outputDir: '/d',
  source: 'wholeComputer',
  mic: 'default',
} as const;
const BOTH: Track[] = ['microphone', 'meeting'];

class FakeAdapter implements CaptureAdapter {
  sent: { id: string; name: string }[] = [];
  commands: CaptureCommand[] = [];
  killed = false;
  gate: 'open' | 'closed' = 'closed';
  reply: (command: CaptureCommand) => Partial<CaptureAck> | 'never' = () => ({});
  private exit: () => void = () => undefined;

  async send(id: string, command: CaptureCommand): Promise<CaptureAck> {
    this.sent.push({ id, name: command.name });
    this.commands.push(command);
    const custom = this.reply(command);
    if (custom === 'never') return new Promise(() => undefined);
    if (command.name === 'start' || command.name === 'resume') this.gate = 'open';
    if (command.name === 'pause' || command.name === 'stop') this.gate = 'closed';
    return { id, ok: true, gate: this.gate, atNs: 0, activeTracks: BOTH, ...custom };
  }
  onEvent(): void {}
  onExit(listener: () => void): void {
    this.exit = listener;
  }
  kill(): void {
    this.killed = true;
    this.exit();
  }
  crash(): void {
    this.exit();
  }
}

describe('RecordingSession', () => {
  let adapters: FakeAdapter[];
  let ended: SessionEnd[];
  let missing: Track[];
  let seen: string[];
  let session: RecordingSession;
  let nextId: number;
  let firstReply: FakeAdapter['reply'];

  const latest = () => adapters.at(-1) as FakeAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapters = [];
    ended = [];
    missing = [];
    seen = [];
    nextId = 0;
    firstReply = () => ({});
    session = new RecordingSession({
      launch: () => {
        const adapter = new FakeAdapter();
        adapter.reply = firstReply;
        adapters.push(adapter);
        return adapter;
      },
      onStateChanged: (status) => seen.push(status),
      onTrackMissing: (track) => missing.push(track),
      onEnded: (end) => ended.push(end),
      newCommandId: () => `c${nextId++}`,
    });
  });

  afterEach(() => vi.useRealTimers());

  it('runs start, pause, resume and stop', async () => {
    await session.start(OPEN);
    await session.pause();
    expect(session.state).toEqual({ status: 'paused', pauseReason: 'user' });
    await session.resume();
    expect(session.state).toEqual({ status: 'recording', pauseReason: null });
    await session.stop();
    expect(seen).toEqual(['starting', 'recording', 'paused', 'recording', 'stopping', 'idle']);
    expect(ended).toEqual(['stopped']);
  });

  it('stops from a pause without resuming', async () => {
    await session.start(OPEN);
    await session.pause();
    await session.stop();
    expect(latest().sent.map(({ name }) => name)).not.toContain('resume');
    expect(ended).toEqual(['stopped']);
  });

  it('retries a lost pause reply with the same ID', async () => {
    await session.start(OPEN);
    let calls = 0;
    latest().reply = () => (++calls === 1 ? 'never' : {});
    const paused = session.pause();
    await vi.advanceTimersByTimeAsync(200);
    await paused;
    expect(session.state.status).toBe('paused');
    const pauses = latest().sent.filter(({ name }) => name === 'pause');
    expect(pauses).toHaveLength(2);
    expect(pauses[0]?.id).toBe(pauses[1]?.id);
  });

  describe('a pause that cannot be confirmed', () => {
    const failPause = async () => {
      await session.start(OPEN);
      latest().reply = () => 'never';
      const paused = session.pause();
      await vi.advanceTimersByTimeAsync(400);
      await paused;
    };

    it('kills the worker, ends the meeting and never restarts it', async () => {
      await failPause();
      expect(adapters).toHaveLength(1);
      expect(latest().killed).toBe(true);
      expect(ended).toEqual(['pauseFailed']);
      expect(session.state.status).toBe('idle');
      expect(seen).not.toContain('paused');
    });

    it('needs a new Start afterwards', async () => {
      await failPause();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(adapters).toHaveLength(1);
      await session.start(OPEN);
      expect(adapters).toHaveLength(2);
    });

    it('treats a reply saying the gate is open as a failure', async () => {
      await session.start(OPEN);
      latest().reply = () => ({ gate: 'open' });
      await session.pause();
      expect(ended).toEqual(['pauseFailed']);
    });
  });

  it('never shows Recording when no track resumed, and can retry', async () => {
    await session.start(OPEN);
    await session.pause();
    latest().reply = () => ({ ok: false, gate: 'closed', activeTracks: [] });
    await expect(session.resume()).rejects.toThrow(ContractError);
    expect(session.state.status).toBe('paused');
    latest().reply = () => ({});
    await session.resume();
    expect(session.state.status).toBe('recording');
  });

  it('resumes the ready track and reports the other', async () => {
    await session.start(OPEN);
    await session.pause();
    latest().reply = () => ({ activeTracks: ['microphone'] });
    await session.resume();
    expect(session.state.status).toBe('recording');
    expect(missing).toEqual(['meeting']);
  });

  it('records one track when only one opens, and refuses when neither does', async () => {
    const start = session.start(OPEN);
    latest().reply = (command) => (command.name === 'start' ? { activeTracks: ['meeting'] } : {});
    await start;
    expect(missing).toEqual(['microphone']);
    await session.stop();
    const refused = session.start(OPEN);
    latest().reply = (command) => (command.name === 'start' ? { activeTracks: [] } : {});
    await expect(refused).rejects.toThrow(ContractError);
    expect(session.state.status).toBe('idle');
  });

  it('reports the meeting track when system audio permission is denied', async () => {
    firstReply = (command) => (command.name === 'checkPermission' ? { systemAudio: 'denied' } : {});
    await session.start(OPEN);
    expect(missing).toEqual(['meeting']);
  });

  it('refuses commands in the wrong state', async () => {
    await expect(session.pause()).rejects.toThrow('Not recording.');
    await expect(session.resume()).rejects.toThrow('Not paused.');
    await session.start(OPEN);
    await expect(session.start(OPEN)).rejects.toThrow('already running');
    await expect(session.resume()).rejects.toThrow('Not paused.');
  });

  it('lets Stop win while a pause is waiting', async () => {
    await session.start(OPEN);
    latest().reply = (command) => (command.name === 'pause' ? 'never' : {});
    const paused = session.pause();
    await session.stop();
    await vi.advanceTimersByTimeAsync(400);
    await paused;
    expect(ended).toEqual(['stopped']);
    expect(seen).not.toContain('paused');
  });

  it('restarts a crashed worker in the same meeting, up to the limit', async () => {
    await session.start(OPEN);
    for (let crash = 0; crash < MAX_WORKER_RESTARTS; crash += 1) {
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
      expect(session.state.status).toBe('recording');
      expect(latest().sent.map(({ name }) => name)).toEqual(['open', 'start']);
    }
    latest().crash();
    await vi.advanceTimersByTimeAsync(0);
    expect(adapters).toHaveLength(MAX_WORKER_RESTARTS + 1);
    expect(ended).toEqual(['workerFailed']);
  });

  describe('the session clock across a restart', () => {
    const ORIGIN = 123_456_789;
    const opened = (adapter: FakeAdapter) =>
      adapter.commands.find(({ name }) => name === 'open') as OpenCommand;
    const reportOrigin: FakeAdapter['reply'] = (command) =>
      command.name === 'start' ? { clockOriginNs: ORIGIN } : {};
    const crash = async () => {
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
    };

    it('does not send an origin to the first worker', async () => {
      firstReply = reportOrigin;
      await session.start(OPEN);
      expect(opened(latest())).toEqual(OPEN);
    });

    it('gives every restarted worker the first worker origin', async () => {
      firstReply = (command) =>
        command.name === 'start' ? { clockOriginNs: ORIGIN + adapters.length } : {};
      await session.start(OPEN);
      const first = ORIGIN + 1;
      await crash();
      expect(opened(latest())).toEqual({ ...OPEN, clockOriginNs: first });
      await crash();
      expect(opened(latest())).toEqual({ ...OPEN, clockOriginNs: first });
    });

    it('gives the origin to a worker restarted during a pause', async () => {
      firstReply = reportOrigin;
      await session.start(OPEN);
      await session.pause();
      await crash();
      expect(opened(latest()).clockOriginNs).toBe(ORIGIN);
      await session.resume();
      expect(session.state.status).toBe('recording');
    });

    it('opens as before when the helper reports no origin', async () => {
      await session.start(OPEN);
      await crash();
      expect(opened(latest())).toEqual(OPEN);
    });

    it('does not carry an origin into the next recording', async () => {
      firstReply = reportOrigin;
      await session.start(OPEN);
      await session.stop();
      firstReply = () => ({});
      await session.start(OPEN);
      await crash();
      expect(opened(latest())).toEqual(OPEN);
    });
  });

  describe('a worker crash before the start ack', () => {
    const crashWaitingFor = async (name: CaptureCommand['name']) => {
      firstReply = (command) => (command.name === name ? 'never' : {});
      const start = session.start(OPEN);
      const outcome = expect(start).rejects.toThrow(ContractError);
      await vi.advanceTimersByTimeAsync(0);
      expect(latest().sent.at(-1)?.name).toBe(name);
      expect(session.state.status).toBe('starting');
      latest().crash();
      await outcome;
      firstReply = () => ({});
    };

    it.each(['checkPermission', 'open', 'start'] as const)(
      'rejects the start while waiting for %s and does not restart',
      async (name) => {
        await crashWaitingFor(name);
        expect(session.state.status).toBe('idle');
        expect(adapters).toHaveLength(1);
        expect(ended).toEqual([]);
        expect(seen).toEqual(['starting', 'idle']);
      },
    );

    it('allows a later start with a full restart budget', async () => {
      await crashWaitingFor('start');
      await session.start(OPEN);
      expect(session.state.status).toBe('recording');
      for (let crash = 0; crash < MAX_WORKER_RESTARTS; crash += 1) {
        latest().crash();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(session.state.status).toBe('recording');
      expect(adapters).toHaveLength(MAX_WORKER_RESTARTS + 2);
    });

    it('ignores a late exit from the crashed worker during a later start', async () => {
      await crashWaitingFor('start');
      const crashed = latest();
      const start = session.start(OPEN);
      crashed.crash();
      await start;
      expect(session.state.status).toBe('recording');
      expect(adapters).toHaveLength(2);
    });

    it('ignores a late ack from the crashed worker', async () => {
      let ack: (reply: CaptureAck) => void = () => undefined;
      const start = session.start(OPEN);
      const outcome = expect(start).rejects.toThrow(ContractError);
      latest().send = (id, command) =>
        command.name === 'start'
          ? new Promise((resolve) => {
              ack = resolve;
            })
          : Promise.resolve({ id, ok: true, gate: 'closed', atNs: 0, activeTracks: BOTH });
      await vi.advanceTimersByTimeAsync(0);
      latest().crash();
      await outcome;
      ack({ id: 'late', ok: true, gate: 'open', atNs: 0, activeTracks: BOTH });
      await vi.advanceTimersByTimeAsync(0);
      expect(session.state.status).toBe('idle');
    });
  });

  it('keeps a crashed worker paused rather than recording', async () => {
    await session.start(OPEN);
    await session.pause();
    latest().crash();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.state.status).toBe('paused');
    expect(latest().sent.map(({ name }) => name)).toEqual(['open']);
  });
});
