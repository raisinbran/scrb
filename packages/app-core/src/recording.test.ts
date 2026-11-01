import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError } from '@scrb/contracts';
import { ProcessAdapter } from '@scrb/capture';
import type { CaptureAck, CaptureAdapter, CaptureCommand, OpenCommand, Track } from '@scrb/capture';
import { chunk } from './chunk-fixture.ts';
import {
  MAX_WORKER_RESTARTS,
  RESTART_WAITS_MS,
  RecordingSession,
  type SessionEnd,
} from './recording.ts';
import { sealAudio } from './recovery.ts';

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
  let launchFailures: number;

  const latest = () => adapters.at(-1) as FakeAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    adapters = [];
    ended = [];
    missing = [];
    seen = [];
    nextId = 0;
    firstReply = () => ({});
    launchFailures = 0;
    session = new RecordingSession({
      launch: () => {
        if (launchFailures > 0) {
          launchFailures -= 1;
          throw new Error('spawn failed');
        }
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

  it('makes a second stop wait for the first, so quitting cannot pass a stop in progress', async () => {
    await session.start(OPEN);
    latest().reply = (command) => (command.name === 'stop' ? 'never' : {});
    const first = session.stop();
    let secondDone = false;
    const second = session.stop().then(() => {
      secondDone = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(secondDone).toBe(false);
    latest().crash();
    await Promise.all([first, second]);
    expect(ended).toEqual(['stopped']);
  });

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

  describe('three worker kills in one recording', () => {
    const SECOND = 1_000_000_000;
    const ORIGIN = 500_000;
    const TRACK_NAMES = ['microphone', 'meeting'] as const;
    let audio: string;
    let now: number;

    const logEvent = (line: object) =>
      appendFileSync(join(audio, 'session.log'), `${JSON.stringify(line)}\n`);
    const saveChunk = (seq: number, from: number, to: number, reason: string) => {
      for (const track of TRACK_NAMES) {
        mkdirSync(join(audio, track), { recursive: true });
        writeFileSync(
          join(audio, track, `00000${seq}.opus`),
          chunk(seq, from * SECOND, to - from, reason),
        );
      }
    };
    const logStop = (seq: number) => {
      for (const track of TRACK_NAMES) {
        const line = { file: `00000${seq}.opus`, closeReason: 'stop' };
        writeFileSync(join(audio, track, 'chunks.log'), `${JSON.stringify(line)}\n`);
      }
    };
    const crashAt = async (second: number) => {
      now = second;
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
    };
    const opened = (adapter: FakeAdapter) =>
      adapter.commands.find(({ name }) => name === 'open') as OpenCommand;
    const names = (adapter: FakeAdapter) => adapter.sent.map(({ name }) => name);

    // Writes `session.log` as the helper does, and gives each worker its own clock origin.
    beforeEach(() => {
      audio = mkdtempSync(join(tmpdir(), 'scrb-kills-'));
      now = 0;
      firstReply = (command) => {
        const atNs = now * SECOND;
        if (command.name === 'open') {
          logEvent({ event: 'open', seq: 1 });
          if (command.clockOriginNs !== undefined) logEvent({ event: 'restart', atNs, seq: 2 });
        }
        if (command.name === 'pause' || command.name === 'resume') {
          logEvent({ event: command.name, atNs, seq: 3 });
        }
        return command.name === 'start' ? { clockOriginNs: ORIGIN + adapters.length } : {};
      };
    });

    afterEach(() => rmSync(audio, { recursive: true, force: true }));

    it('keeps recording on one clock and marks only the down time', async () => {
      await session.start(OPEN);
      saveChunk(0, 0, 2, 'start');
      await crashAt(3);
      saveChunk(1, 4, 6, 'workerRestarted');
      now = 6;
      await session.pause();
      await crashAt(8);
      expect(session.state).toEqual({ status: 'paused', pauseReason: 'user' });
      expect(names(latest())).toEqual(['open']);
      expect(latest().gate).toBe('closed');
      now = 9;
      await session.resume();
      saveChunk(2, 9, 11, 'workerRestarted');
      await crashAt(12);
      saveChunk(3, 13, 15, 'workerRestarted');
      now = 15;
      expect(session.state.status).toBe('recording');
      await session.stop();
      logStop(3);

      expect(adapters).toHaveLength(4);
      expect(ended).toEqual(['stopped']);
      expect(opened(adapters[0] as FakeAdapter).clockOriginNs).toBeUndefined();
      for (const adapter of adapters.slice(1)) {
        expect(opened(adapter).clockOriginNs).toBe(ORIGIN + 1);
      }

      const missing = (track: string, from: number, to: number) => ({
        kind: 'audioMissing',
        track,
        startNs: from * SECOND,
        endNs: to * SECOND,
      });
      const sealed = await sealAudio(audio, async () => false);
      expect(sealed.outcome).toBe('ready');
      expect(sealed.endNs).toBe(15 * SECOND);
      expect(sealed.gaps).toEqual([
        missing('microphone', 2, 4),
        missing('meeting', 2, 4),
        { kind: 'paused', track: 'both', startNs: 6 * SECOND, endNs: 9 * SECOND },
        missing('microphone', 11, 13),
        missing('meeting', 11, 13),
      ]);
      expect(sealed.tracks.microphone?.chunks.map(({ seq }) => seq)).toEqual([0, 1, 2, 3]);
    });

    it('counts a kill during a pause against the limit, and ends on the fourth', async () => {
      await session.start(OPEN);
      await session.pause();
      for (let kill = 1; kill <= MAX_WORKER_RESTARTS; kill += 1) {
        await crashAt(kill);
        expect(session.state.status).toBe('paused');
        expect(adapters).toHaveLength(kill + 1);
      }
      expect(ended).toEqual([]);
      await crashAt(4);
      expect(adapters).toHaveLength(MAX_WORKER_RESTARTS + 1);
      expect(session.state).toEqual({ status: 'idle', pauseReason: null });
      expect(ended).toEqual(['workerFailed']);
    });

    it('starts the next recording with a full limit', async () => {
      await session.start(OPEN);
      for (let kill = 0; kill < MAX_WORKER_RESTARTS; kill += 1) await crashAt(kill);
      await session.stop();
      await session.start(OPEN);
      for (let kill = 0; kill < MAX_WORKER_RESTARTS; kill += 1) await crashAt(kill);
      expect(session.state.status).toBe('recording');
      expect(ended).toEqual(['stopped']);
    });
  });

  describe('a restart whose launch throws', () => {
    it('counts as a failed restart and tries again', async () => {
      await session.start(OPEN);
      launchFailures = 1;
      latest().crash();
      await vi.advanceTimersByTimeAsync(1000);
      expect(session.state.status).toBe('recording');
      expect(adapters).toHaveLength(2);
      expect(latest().sent.map(({ name }) => name)).toEqual(['open', 'start']);
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
      expect(adapters).toHaveLength(MAX_WORKER_RESTARTS);
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
      expect(ended).toEqual(['workerFailed']);
    });

    it('ends the meeting when every restart throws', async () => {
      await session.start(OPEN);
      launchFailures = MAX_WORKER_RESTARTS;
      latest().crash();
      await vi.advanceTimersByTimeAsync(3500);
      expect(adapters).toHaveLength(1);
      expect(launchFailures).toBe(0);
      expect(session.state).toEqual({ status: 'idle', pauseReason: null });
      expect(ended).toEqual(['workerFailed']);
    });
  });

  describe('the wait between restart tries', () => {
    const refuseOpen: FakeAdapter['reply'] = (command) =>
      command.name === 'open' ? { ok: false } : {};
    const failFirstRestart = async () => {
      await session.start(OPEN);
      firstReply = refuseOpen;
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
      expect(adapters).toHaveLength(2);
      firstReply = () => ({});
    };

    it('restarts at once, then tries again after each wait', async () => {
      await session.start(OPEN);
      firstReply = refuseOpen;
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
      expect(adapters).toHaveLength(2);
      await vi.advanceTimersByTimeAsync((RESTART_WAITS_MS[0] as number) - 1);
      expect(adapters).toHaveLength(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(adapters).toHaveLength(3);
      firstReply = () => ({});
      await vi.advanceTimersByTimeAsync(RESTART_WAITS_MS[1] as number);
      expect(adapters).toHaveLength(4);
      expect(latest().sent.map(({ name }) => name)).toEqual(['open', 'start']);
      expect(session.state.status).toBe('recording');
    });

    it('lets Stop finish at once, and starts no further worker', async () => {
      await failFirstRestart();
      await session.stop();
      expect(ended).toEqual(['stopped']);
      await vi.advanceTimersByTimeAsync(5000);
      expect(adapters).toHaveLength(2);
    });

    it('confirms Pause at once, and keeps the next worker closed', async () => {
      await failFirstRestart();
      await session.pause();
      expect(session.state).toEqual({ status: 'paused', pauseReason: 'user' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(adapters).toHaveLength(3);
      expect(latest().sent.map(({ name }) => name)).toEqual(['open']);
      await session.resume();
      expect(session.state.status).toBe('recording');
    });

    it('refuses Resume and stays Paused', async () => {
      await failFirstRestart();
      await session.pause();
      await expect(session.resume()).rejects.toThrow(ContractError);
      expect(session.state.status).toBe('paused');
    });
  });

  describe('a worker crash with a command waiting', () => {
    const crash = async () => {
      latest().crash();
      await vi.advanceTimersByTimeAsync(0);
    };

    it('never starts a restarted worker while a pause is waiting', async () => {
      await session.start(OPEN);
      latest().reply = (command) => (command.name === 'pause' ? 'never' : {});
      const paused = session.pause();
      await crash();
      await vi.advanceTimersByTimeAsync(200);
      await paused;
      expect(session.state.status).toBe('paused');
      expect(latest().sent.map(({ name }) => name)).toEqual(['open', 'pause']);
      expect(latest().gate).toBe('closed');
    });

    it('rejects a waiting resume, stays paused and can retry', async () => {
      await session.start(OPEN);
      await session.pause();
      latest().reply = (command) => (command.name === 'resume' ? 'never' : {});
      const resumed = session.resume();
      const outcome = expect(resumed).rejects.toThrow(ContractError);
      await crash();
      await outcome;
      expect(session.state.status).toBe('paused');
      await session.resume();
      expect(session.state.status).toBe('recording');
    });

    it('finishes a waiting stop', async () => {
      await session.start(OPEN);
      latest().reply = (command) => (command.name === 'stop' ? 'never' : {});
      const stopped = session.stop();
      await crash();
      await stopped;
      expect(adapters).toHaveLength(1);
      expect(session.state.status).toBe('idle');
      expect(ended).toEqual(['stopped']);
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

describe('a helper that never launches', () => {
  it('rejects the start', async () => {
    const session = new RecordingSession({
      launch: () => new ProcessAdapter(join(tmpdir(), 'scrb-no-such-helper')),
      onStateChanged: () => undefined,
      onTrackMissing: () => undefined,
      onEnded: () => undefined,
      newCommandId: () => 'c',
    });
    await expect(session.start(OPEN)).rejects.toThrow(ContractError);
    expect(session.state.status).toBe('idle');
  });
});
