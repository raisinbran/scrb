import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import {
  assertFreshOutside,
  compareHashes,
  contiguity,
  descendants,
  findRecording,
  roleOf,
  totals,
} from './gate3-retest/memory-worker-kill.mjs';

const TOOL = join(import.meta.dirname, 'gate3-retest', 'memory-worker-kill.mjs');
const MIB = 1048576;
const row = (pid, ppid, name, ws = 10 * MIB, priv = 5 * MIB, cmd = '') => ({
  pid,
  ppid,
  name,
  cmd,
  ws,
  priv,
});

describe('process tree and memory sums', () => {
  const rows = [
    row(1, 0, 'explorer.exe'),
    row(10, 1, 'electron.exe'),
    row(11, 10, 'electron.exe', 300 * MIB, 200 * MIB, '--type=renderer'),
    row(12, 10, 'electron.exe', 100 * MIB, 50 * MIB, '--type=gpu-process'),
    row(13, 10, 'scrb-capture.exe'),
    row(14, 10, 'whisper-server.exe', 600 * MIB, 580 * MIB),
    row(15, 14, 'conhost.exe'),
    row(99, 1, 'chrome.exe', 900 * MIB),
  ];

  it('takes the app and everything below it, and nothing else', () => {
    expect(
      descendants(rows, 10)
        .map((r) => r.pid)
        .sort((a, b) => a - b),
    ).toEqual([10, 11, 12, 13, 14, 15]);
    expect(descendants(rows, 12345)).toEqual([]);
  });

  it('names the roles and sums working set and private bytes', () => {
    const tree = descendants(rows, 10);
    const roles = Object.fromEntries(tree.map((r) => [r.pid, roleOf(r, 10)]));
    expect(roles).toMatchObject({
      10: 'main',
      11: 'renderer',
      12: 'gpu',
      13: 'capture-helper',
      14: 'live-worker',
    });
    const t = totals(tree);
    expect(t.count).toBe(6);
    expect(t.ws).toBe((10 + 300 + 100 + 10 + 600 + 10) * MIB);
  });
});

describe('chunk checks', () => {
  it('finds numbering gaps and changed, missing and unchanged chunks', () => {
    expect(contiguity(['000000.opus', '000001.opus', '000003.opus'])).toEqual({
      count: 3,
      max: 3,
      gaps: [2],
    });
    expect(contiguity([])).toEqual({ count: 0, max: -1, gaps: [] });
    const pre = {
      microphone: { '000000.opus': 'a', '000001.opus': 'b' },
      meeting: { '000000.opus': 'c' },
    };
    const now = { microphone: { '000000.opus': 'a', '000001.opus': 'X' }, meeting: {} };
    expect(compareHashes(pre, now)).toEqual({
      unchanged: 1,
      changed: ['microphone/000001.opus'],
      missing: ['meeting/000000.opus'],
    });
  });
});

describe('out folder', () => {
  let base;
  beforeEach(() => (base = realpathSync(mkdtempSync(join(tmpdir(), 'mwk-')))));
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('must be new and outside the repo', () => {
    const repo = join(base, 'repo');
    mkdirSync(join(repo, 'sub'), { recursive: true });
    expect(() => assertFreshOutside(join(repo, 'sub', 'ev'), repo)).toThrow('E_OUT_IN_REPO');
    mkdirSync(join(base, 'ev'));
    expect(() => assertFreshOutside(join(base, 'ev'), repo)).toThrow('E_OUT_EXISTS');
    expect(() => assertFreshOutside(join(base, 'new'), repo)).not.toThrow();
  });

  it('finds only a meeting whose status is recording', () => {
    const lib = join(base, 'lib');
    for (const [id, status] of [
      ['a', 'ready'],
      ['b', 'recording'],
    ]) {
      mkdirSync(join(lib, 'meetings', id), { recursive: true });
      writeFileSync(join(lib, 'meetings', id, 'meeting.json'), JSON.stringify({ status }));
    }
    expect(findRecording(lib)).toBe(join(lib, 'meetings', 'b'));
    expect(findRecording(join(base, 'none'))).toBeNull();
  });
});

// End to end on Windows with invented processes: a stand-in "app" whose child is named whisper-server.exe
// and is restarted when killed. No real app, audio or model is involved.
describe.skipIf(process.platform !== 'win32')('watch and verify (invented app)', () => {
  let base;
  let app;
  beforeEach(() => (base = realpathSync(mkdtempSync(join(tmpdir(), 'mwk-e2e-')))));
  afterEach(() => {
    // The stand-in worker is a grandchild: end the whole tree so its copied exe is not locked.
    if (app?.pid) spawnSync('taskkill', ['/PID', String(app.pid), '/T', '/F']);
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const track = (folder, t, n, bytes) => {
    mkdirSync(join(folder, 'audio', t), { recursive: true });
    for (let i = 0; i < n; i += 1)
      writeFileSync(
        join(folder, 'audio', t, `${String(i).padStart(6, '0')}.opus`),
        `${t}-${i}-${bytes}`,
      );
  };

  it('kills the worker once, sees it run again, and verify passes only when nothing changed', async () => {
    const worker = join(base, 'whisper-server.exe');
    copyFileSync(process.execPath, worker);
    const parent = join(base, 'parent.mjs');
    writeFileSync(
      parent,
      `import { spawn } from 'node:child_process';
       const start = () => { const c = spawn(${JSON.stringify(worker)}, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); c.on('exit', () => setTimeout(start, 1500)); };
       start(); setInterval(() => {}, 1000);`,
    );
    app = spawn(process.execPath, [parent], { stdio: 'ignore' });
    const lib = join(base, 'lib');
    const meeting = join(lib, 'meetings', 'm1');
    mkdirSync(meeting, { recursive: true });
    writeFileSync(join(meeting, 'meeting.json'), JSON.stringify({ status: 'recording' }));
    track(meeting, 'microphone', 2, 'x');
    track(meeting, 'meeting', 2, 'x');
    const out = join(base, 'evidence');

    const watcher = spawn(
      process.execPath,
      [
        TOOL,
        'watch',
        '--app-pid',
        String(app.pid),
        '--library',
        lib,
        '--out',
        out,
        '--seconds',
        '60',
        '--interval',
        '1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    watcher.stdout.on('data', (d) => (stdout += d));
    await sleep(4000);
    writeFileSync(join(out, 'KILL'), '');
    await sleep(9000);
    writeFileSync(join(out, 'STOP'), '');
    await new Promise((r) => watcher.on('exit', r));

    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    expect(summary.kill).not.toBeNull();
    expect(summary.workerRestarted).not.toBeNull();
    expect(summary.workerRestarted.newPid).not.toBe(summary.kill.pid);
    expect(summary.peakWorkingSetMiB).toBeGreaterThan(20);
    expect(summary.withinTarget).toBe(true);
    expect(existsSync(join(out, 'pre-kill-hashes.json'))).toBe(true);
    expect(stdout).toContain('peakWorkingSetMiB');

    // Recording finishes: sealed lists, status ready, no gaps recorded.
    writeFileSync(join(meeting, 'meeting.json'), JSON.stringify({ status: 'ready' }));
    writeFileSync(join(meeting, 'transcript.json'), JSON.stringify({ gaps: [{ kind: 'paused' }] }));
    for (const t of ['microphone', 'meeting'])
      writeFileSync(join(meeting, 'audio', t, 'chunks.json'), '[]');
    const ok = spawnSync(process.execPath, [TOOL, 'verify', '--out', out, '--meeting', meeting], {
      encoding: 'utf8',
    });
    expect(JSON.parse(ok.stdout).result).toBe('PASS');

    // A changed chunk, or a lost-audio gap, makes it FAIL.
    writeFileSync(join(meeting, 'audio', 'microphone', '000001.opus'), 'tampered');
    expect(
      JSON.parse(
        spawnSync(process.execPath, [TOOL, 'verify', '--out', out, '--meeting', meeting], {
          encoding: 'utf8',
        }).stdout,
      ).result,
    ).toBe('FAIL');
    writeFileSync(join(meeting, 'audio', 'microphone', '000001.opus'), 'microphone-1-x');
    writeFileSync(join(meeting, 'transcript.json'), JSON.stringify({ gaps: [{ kind: 'gap' }] }));
    expect(
      JSON.parse(
        spawnSync(process.execPath, [TOOL, 'verify', '--out', out, '--meeting', meeting], {
          encoding: 'utf8',
        }).stdout,
      ).result,
    ).toBe('FAIL');
  }, 60000);

  it('refuses to kill before both tracks have finished chunks, and never prints meeting text', async () => {
    const worker = join(base, 'whisper-server.exe');
    copyFileSync(process.execPath, worker);
    const parent = join(base, 'parent.mjs');
    writeFileSync(
      parent,
      `import { spawn } from 'node:child_process'; spawn(${JSON.stringify(worker)}, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' }); setInterval(() => {}, 1000);`,
    );
    app = spawn(process.execPath, [parent], { stdio: 'ignore' });
    const lib = join(base, 'lib');
    const meeting = join(lib, 'meetings', 'm1');
    mkdirSync(meeting, { recursive: true });
    writeFileSync(
      join(meeting, 'meeting.json'),
      JSON.stringify({ status: 'recording', title: 'SECRETTITLE' }),
    );
    track(meeting, 'microphone', 1, 'x'); // meeting track has no finished chunk yet
    mkdirSync(join(meeting, 'audio', 'meeting'), { recursive: true });
    const out = join(base, 'evidence');
    const watcher = spawn(
      process.execPath,
      [
        TOOL,
        'watch',
        '--app-pid',
        String(app.pid),
        '--library',
        lib,
        '--out',
        out,
        '--seconds',
        '30',
        '--interval',
        '1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    watcher.stdout.on('data', (d) => (stdout += d));
    await sleep(3000);
    writeFileSync(join(out, 'KILL'), '');
    await sleep(3000);
    writeFileSync(join(out, 'STOP'), '');
    await new Promise((r) => watcher.on('exit', r));
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'));
    expect(summary.kill).toBeNull();
    expect(readFileSync(join(out, 'events.log'), 'utf8')).toContain('KILL refused');
    expect(stdout).not.toContain('SECRETTITLE');
    expect(readFileSync(join(out, 'events.log'), 'utf8')).not.toContain('SECRETTITLE');
  }, 60000);
});
