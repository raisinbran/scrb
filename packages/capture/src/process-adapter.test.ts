import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
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

function helper(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scrb-helper-')), 'helper.cjs');
  writeFileSync(path, HELPER);
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
});
