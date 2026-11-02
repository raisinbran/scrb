import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ProcessAdapter } from './process-adapter.ts';

// A small stand-in for a helper: acks each line, and sends an event first.
const HELPER = `#!/usr/bin/env node
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  console.log('not json');
  console.log(JSON.stringify({ type: 'event', event: 'streamDead', track: 'meeting' }));
  console.log(JSON.stringify({ type: 'ack', id, ok: true, gate: 'open', atNs: 5, activeTracks: [] }));
});
`;

const LIVE_HELPER = `#!/usr/bin/env node
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  if (process.env.SCRB_LIVE_FD === '3') {
    require('node:fs').writeSync(3, Buffer.from([83, 76, 80, 49]));
  }
  console.log(JSON.stringify({ type: 'ack', id, ok: true, gate: 'open', atNs: 5, activeTracks: [] }));
});
`;

const EARLY_EOF_HELPER = `#!/usr/bin/env node
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  require('node:fs').closeSync(3);
  console.log(JSON.stringify({ type: 'ack', id, ok: true, gate: 'open', atNs: 5, activeTracks: [] }));
});
`;

const STOP_EOF_HELPER = `#!/usr/bin/env node
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const { id, name } = JSON.parse(line);
  if (name === 'stop') require('node:fs').closeSync(3);
  console.log(JSON.stringify({ type: 'ack', id, ok: true, gate: 'closed', atNs: 5, activeTracks: [] }));
  if (name === 'stop') setTimeout(() => process.exit(0), 10);
});
`;

const EXIT_HELPER = `#!/usr/bin/env node
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const { id } = JSON.parse(line);
  require('node:fs').closeSync(3);
  console.log(JSON.stringify({ type: 'ack', id, ok: true, gate: 'open', atNs: 5, activeTracks: [] }));
  setTimeout(() => process.exit(2), 100);
});
`;

function helper(script = HELPER): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scrb-helper-')), 'helper.cjs');
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

describe.skipIf(process.platform === 'win32')('ProcessAdapter', () => {
  it('matches replies to IDs, passes events on and reports exit', async () => {
    const adapter = new ProcessAdapter(helper());
    const events: string[] = [];
    adapter.onEvent((event) => events.push(event.type));
    const ack = await adapter.send('c1', { name: 'start' });
    expect(ack).toMatchObject({ id: 'c1', ok: true, gate: 'open' });
    expect(events).toEqual(['streamDead']);
    const exited = new Promise<void>((resolve) => adapter.onExit(resolve));
    adapter.kill();
    await exited;
  });

  it('reports exit when the helper never launches', async () => {
    const adapter = new ProcessAdapter(join(tmpdir(), 'scrb-no-such-helper'));
    await new Promise<void>((resolve) => adapter.onExit(resolve));
  });
  it('reads live bytes on an independent descriptor', async () => {
    const chunks: Buffer[] = [];
    const onError = vi.fn();
    const adapter = new ProcessAdapter(helper(LIVE_HELPER), [], {
      onData: (bytes) => chunks.push(Buffer.from(bytes)),
      onEnd: () => undefined,
      onError,
    });
    const ack = await adapter.send('live1', { name: 'start' });
    expect(ack.ok).toBe(true);
    await vi.waitFor(() => expect(Buffer.concat(chunks).toString('ascii')).toBe('SLP1'));
    expect(onError).not.toHaveBeenCalled();
    const exited = new Promise<void>((resolve) => adapter.onExit(resolve));
    adapter.kill();
    await exited;
  });

  it('reports live-only EOF while keeping capture running', async () => {
    const onError = vi.fn();
    const onEnd = vi.fn();
    const adapter = new ProcessAdapter(helper(EARLY_EOF_HELPER), [], {
      onData: () => undefined,
      onEnd,
      onError,
    });
    expect((await adapter.send('start', { name: 'start' })).ok).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce(), { timeout: 3000 });
    expect(onEnd).not.toHaveBeenCalled();
    const exited = new Promise<void>((resolve) => adapter.onExit(resolve));
    adapter.kill();
    await exited;
  });

  it('keeps Stop and helper exit free of false live failures', async () => {
    const stopError = vi.fn();
    const stopped = vi.fn();
    const normal = new ProcessAdapter(helper(STOP_EOF_HELPER), [], {
      onData: () => undefined,
      onEnd: stopped,
      onError: stopError,
    });
    expect((await normal.send('start', { name: 'start' })).ok).toBe(true);
    const normalExit = new Promise<void>((resolve) => normal.onExit(resolve));
    expect((await normal.send('stop', { name: 'stop' })).ok).toBe(true);
    await normalExit;
    await vi.waitFor(() => expect(stopped).toHaveBeenCalledOnce());
    expect(stopError).not.toHaveBeenCalled();

    const exitError = vi.fn();
    const exited = vi.fn();
    const crashed = new ProcessAdapter(helper(EXIT_HELPER), [], {
      onData: () => undefined,
      onEnd: exited,
      onError: exitError,
    });
    const crashExit = new Promise<void>((resolve) => crashed.onExit(resolve));
    expect((await crashed.send('start', { name: 'start' })).ok).toBe(true);
    await crashExit;
    await vi.waitFor(() => expect(exited).toHaveBeenCalledOnce());
    expect(exitError).not.toHaveBeenCalled();
  });

  it('keeps capture acknowledgements when live callbacks throw', async () => {
    const onError = vi.fn();
    const adapter = new ProcessAdapter(helper(LIVE_HELPER), [], {
      onData: () => {
        throw new Error('invented live failure');
      },
      onEnd: () => undefined,
      onError,
    });
    const ack = await adapter.send('live2', { name: 'start' });
    expect(ack.ok).toBe(true);
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    const exited = new Promise<void>((resolve) => adapter.onExit(resolve));
    adapter.kill();
    await exited;
  });
});
