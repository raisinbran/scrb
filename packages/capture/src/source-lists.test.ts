import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readApps, readMics } from './source-lists.ts';

function helper(body: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'scrb-helper-')), 'helper.cjs');
  writeFileSync(
    path,
    `#!/usr/bin/env node
const ack = (fields) => console.log(JSON.stringify({ type: 'ack', ok: true, gate: 'closed', atNs: null, activeTracks: [], ...fields }));
require('node:readline').createInterface({ input: process.stdin }).on('line', (line) => {
  const command = JSON.parse(line);
  ${body}
});
`,
  );
  chmodSync(path, 0o755);
  return path;
}

const MIC = { id: 'uid-1', name: 'Mic', isSystemDefault: true, transport: 'usb' };

describe.skipIf(process.platform === 'win32')('source lists', () => {
  it('reads the mics a helper reports', async () => {
    const path = helper(`ack({ id: command.id, mics: [${JSON.stringify(MIC)}] });`);
    expect(await readMics(path)).toEqual([MIC]);
  });

  it('asks for the included apps and reads the reply', async () => {
    const path = helper(
      `ack({ id: command.id, apps: command.include.map((bundleId) => ({ bundleId, name: 'A', running: false, pids: [] })) });`,
    );
    expect(await readApps(path, ['com.example.app'])).toEqual([
      { bundleId: 'com.example.app', name: 'A', running: false, pids: [] },
    ]);
  });

  it('fails when the helper refuses', async () => {
    const path = helper(`ack({ id: command.id, ok: false, error: 'unknown command' });`);
    await expect(readMics(path)).rejects.toThrow('unknown command');
  });

  it('fails rather than waits when the helper dies', async () => {
    await expect(readMics(helper('process.exit(1);'))).rejects.toThrow('stopped');
  });

  it('fails rather than waits when the helper hangs', async () => {
    await expect(readMics(helper(''), 50)).rejects.toThrow('did not answer');
  });
});
