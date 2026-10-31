import { describe, expect, it, vi } from 'vitest';
import type { CaptureAck, CaptureAdapter, CaptureCommand, Track } from '@scrb/capture';
import { MAX_WORKER_RESTARTS, RecordingSession, type SessionEnd } from './recording.ts';

const TRACKS: Track[] = ['microphone', 'meeting'];
const OPEN = {
  name: 'open',
  sessionId: 'synthetic',
  outputDir: 'unused',
  source: 'wholeComputer',
  mic: 'default',
} as const;

type Reply = (command: CaptureCommand, attempt: number) => Partial<CaptureAck>;

class Adapter implements CaptureAdapter {
  readonly sent: CaptureCommand[] = [];
  killed = false;
  private gate: 'open' | 'closed' = 'closed';
  private exited: () => void = () => undefined;

  constructor(
    private readonly attempt: number,
    private readonly reply: Reply,
  ) {}

  async send(id: string, command: CaptureCommand): Promise<CaptureAck> {
    this.sent.push(command);
    if (command.name === 'start' || command.name === 'resume') this.gate = 'open';
    if (command.name === 'pause' || command.name === 'stop') this.gate = 'closed';
    return {
      id,
      ok: true,
      gate: this.gate,
      atNs: 0,
      activeTracks: TRACKS,
      ...this.reply(command, this.attempt),
    };
  }

  onEvent(): void {}
  onExit(listener: () => void): void {
    this.exited = listener;
  }
  kill(): void {
    this.killed = true;
    this.exited();
  }
  crash(): void {
    this.exited();
  }
}

function scenario(reply: Reply) {
  const adapters: Adapter[] = [];
  const ended: SessionEnd[] = [];
  const missing: Track[] = [];
  let next = 0;
  const session = new RecordingSession({
    launch: () => {
      const adapter = new Adapter(adapters.length, reply);
      adapters.push(adapter);
      return adapter;
    },
    onStateChanged: () => undefined,
    onTrackMissing: (track) => missing.push(track),
    onEnded: (end) => ended.push(end),
    newCommandId: () => `id-${next++}`,
  });
  return { session, adapters, ended, missing };
}

const names = (adapter: Adapter) => adapter.sent.map((command) => command.name);

describe('failed worker-restart acknowledgements', () => {
  it('kills a refused open without sending Start, then continues on the original clock', async () => {
    const origin = 123_456_789;
    const { session, adapters, ended } = scenario((command, attempt) => {
      if (attempt === 0 && command.name === 'start') return { clockOriginNs: origin };
      if (attempt === 1 && command.name === 'open') {
        return { ok: false, error: 'writer lock held' };
      }
      return {};
    });
    await session.start(OPEN);
    adapters[0]!.crash();
    await vi.waitFor(() => expect(adapters).toHaveLength(3));
    await vi.waitFor(() => expect(names(adapters[2]!)).toEqual(['open', 'start']));
    expect(names(adapters[1]!)).toEqual(['open']);
    expect(adapters[1]!.killed).toBe(true);
    expect(adapters[2]!.sent[0]).toEqual({ ...OPEN, clockOriginNs: origin });
    expect(session.state.status).toBe('recording');
    expect(ended).toEqual([]);
    await session.stop();
  });

  it('exhausts three refused opens and ends once with workerFailed', async () => {
    const { session, adapters, ended } = scenario((command, attempt) =>
      attempt > 0 && command.name === 'open' ? { ok: false, error: 'no track opened' } : {},
    );
    await session.start(OPEN);
    adapters[0]!.crash();
    await vi.waitFor(() => expect(ended).toEqual(['workerFailed']));
    expect(adapters).toHaveLength(MAX_WORKER_RESTARTS + 1);
    for (const adapter of adapters.slice(1)) {
      expect(names(adapter)).toEqual(['open']);
      expect(adapter.killed).toBe(true);
      adapter.crash(); // A late callback cannot spawn another replacement.
    }
    await Promise.resolve();
    expect(adapters).toHaveLength(MAX_WORKER_RESTARTS + 1);
    expect(session.state.status).toBe('idle');
  });

  it('refuses a failed Start ack rather than pretending the replacement works', async () => {
    const { session, adapters } = scenario((command, attempt) =>
      attempt === 1 && command.name === 'start' ? { ok: false, error: 'not ready' } : {},
    );
    await session.start(OPEN);
    adapters[0]!.crash();
    await vi.waitFor(() => expect(adapters).toHaveLength(3));
    await vi.waitFor(() => expect(names(adapters[2]!)).toEqual(['open', 'start']));
    expect(names(adapters[1]!)).toEqual(['open', 'start']);
    expect(adapters[1]!.killed).toBe(true);
    await session.stop();
  });

  it('retries an open refusal while paused without opening the gate', async () => {
    const { session, adapters } = scenario((command, attempt) =>
      attempt === 1 && command.name === 'open' ? { ok: false } : {},
    );
    await session.start(OPEN);
    await session.pause();
    adapters[0]!.crash();
    await vi.waitFor(() => expect(adapters).toHaveLength(3));
    await vi.waitFor(() => expect(names(adapters[2]!)).toEqual(['open']));
    expect(names(adapters[1]!)).toEqual(['open']);
    expect(session.state.status).toBe('paused');
    await session.resume();
    expect(names(adapters[2]!)).toEqual(['open', 'resume']);
    await session.stop();
  });

  it('retries when the replacement returns no active tracks', async () => {
    const { session, adapters } = scenario((command, attempt) =>
      attempt === 1 && command.name === 'start' ? { activeTracks: [] } : {},
    );
    await session.start(OPEN);
    adapters[0]!.crash();
    await vi.waitFor(() => expect(adapters).toHaveLength(3));
    await vi.waitFor(() => expect(names(adapters[2]!)).toEqual(['open', 'start']));
    expect(adapters[1]!.killed).toBe(true);
    await session.stop();
  });
});
