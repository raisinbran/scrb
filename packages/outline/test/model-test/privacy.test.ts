import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { isLocalUrl } from '../../eval/model-test/backend.js';
import { assertOutsideRepo } from '../../eval/model-test/cli.js';
import { RunError } from '../../eval/model-test/errors.js';
import { assertOffline } from '../../eval/model-test/netcheck.js';
import type { Meeting } from '../../eval/model-test/run.js';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = resolve(PKG, '../..');
const CLI = join(PKG, 'eval/model-test/cli.ts');

/** Unique per run, built at run time so no source file or earlier run can contain them. */
const tag = (): string => randomBytes(6).toString('hex');
const MARKERS = {
  outline: `ZQOUTLINE${tag()}`,
  transcript: `ZQTRANSCRIPT${tag()}`,
  reference: `ZQREFERENCE${tag()}`,
  speaker: `ZQSPEAKER${tag()}`,
  added: `ZQADDED${tag()}`,
};
const ALL = Object.values(MARKERS);

/** An invented meeting. Every field a real run reads carries a marker. */
function invented(): Meeting {
  const lines = Array.from({ length: 30 }, (_, i) => ({
    speaker: i % 2 ? MARKERS.speaker : 'Zed',
    text: `Item ${i} ${MARKERS.transcript}${i} owner will review the plan by March ${(i % 27) + 1}.`,
  }));
  const topic = (n: number, inOutline: boolean) => ({
    title: inOutline ? `${MARKERS.outline}${n}` : `${MARKERS.added}${n}`,
    inOutline,
    points: Array.from(
      { length: 6 },
      (_, k) => `Review ${MARKERS.reference}${n}${k} plan by March ${k + 1}.`,
    ),
  });
  return {
    outline: [0, 1, 2, 3].map((n) => `${MARKERS.outline}${n}`),
    lines,
    reference: [topic(0, true), topic(1, true), topic(2, true), topic(3, true), topic(4, false)],
  };
}

function listFiles(root: string, skip: (p: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (skip(p)) continue;
      const st = statSync(p, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out;
}

/** Files in the repo that git tracks or would add (so ignored build output is not scanned). */
function repoFiles(): string[] {
  const names = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: REPO,
    maxBuffer: 1 << 28,
  })
    .toString()
    .split('\0')
    .filter(Boolean);
  return names.map((n) => join(REPO, n));
}

function hits(text: string): string[] {
  return ALL.filter((m) => text.includes(m));
}

const cleanup: string[] = [];
afterAll(() => {
  for (const d of cleanup) rmSync(d, { recursive: true, force: true });
});

function runCli(backend: string): {
  stdout: string;
  stderr: string;
  status: number | null;
  out: string;
  temp: string;
  meeting: string;
} {
  const base = mkdtempSync(join(tmpdir(), 'scrb-privacy-'));
  cleanup.push(base);
  const out = join(base, 'out');
  const temp = join(base, 'temp');
  mkdirSync(temp);
  const meeting = join(base, 'meeting.json');
  writeFileSync(meeting, JSON.stringify(invented()));
  const r = spawnSync(
    process.execPath,
    ['--import', 'tsx', CLI, 'run', '--meeting', meeting, '--out', out, '--backend', backend],
    {
      cwd: PKG,
      encoding: 'utf8',
      env: { ...process.env, TEMP: temp, TMP: temp, TMPDIR: temp },
      timeout: 120_000,
    },
  );
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, out, temp, meeting };
}

describe('privacy: markers never leave the designated output folder', () => {
  it('a full run on an invented meeting leaks nothing to stdout, stderr, temp files or the repo', () => {
    const r = runCli('mock');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/^RUN_DONE 1$/m);

    // The test is not vacuous: the markers really are in the allowed place (the raw model output).
    const raw = listFiles(join(r.out, 'raw'), () => false)
      .map((p) => readFileSync(p, 'utf8'))
      .join('\n');
    expect(hits(raw).length).toBeGreaterThan(0);

    expect(hits(r.stdout)).toEqual([]);
    expect(hits(r.stderr)).toEqual([]);
    for (const p of listFiles(r.temp, () => false))
      expect(hits(readFileSync(p, 'utf8')), 'temp file').toEqual([]);
    // Result and manifest files hold numbers only, even though they sit in the allowed folder.
    for (const p of listFiles(join(r.out, 'results'), () => false))
      expect(hits(readFileSync(p, 'utf8')), 'results file').toEqual([]);
    expect(readdirSync(r.out).sort()).toEqual(['raw', 'results']); // temp folder already removed

    for (const p of repoFiles()) {
      const st = statSync(p, { throwIfNoEntry: false });
      if (!st || st.size > 5_000_000) continue;
      expect(hits(readFileSync(p, 'latin1')), p).toEqual([]);
    }
  }, 150_000);

  it('a failing backend whose error text contains transcript text prints only a fixed code', () => {
    const r = runCli('mock-fail');
    expect(hits(r.stdout)).toEqual([]);
    expect(hits(r.stderr)).toEqual([]);
    expect(r.stdout).toMatch(/TASK_A_E_UNEXPECTED 0/);
    expect(r.stdout).toMatch(/TASK_B_E_UNEXPECTED 0/);
    for (const p of listFiles(r.out, () => false))
      expect(hits(readFileSync(p, 'utf8'))).toEqual([]);
    for (const p of listFiles(r.temp, () => false))
      expect(hits(readFileSync(p, 'utf8'))).toEqual([]);
  }, 150_000);

  it('prints only fixed codes and numbers', () => {
    const r = runCli('mock');
    for (const line of r.stdout.split('\n').filter(Boolean))
      expect(line).toMatch(/^[A-Z][A-Z0-9_]*( -?\d+(\.\d+)?)*$/);
    expect(r.stderr).toBe('');
  }, 150_000);

  it('refuses an output folder inside the repo', () => {
    expect(() => assertOutsideRepo(join(REPO, 'docs'))).toThrowError(RunError);
    const r = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        CLI,
        'run',
        '--meeting',
        join(PKG, 'package.json'),
        '--out',
        join(REPO, 'zz-no-out'),
        '--backend',
        'mock',
      ],
      { cwd: PKG, encoding: 'utf8' },
    );
    expect(r.stdout.trim()).toBe('FAILED_E_OUT_IN_REPO');
    expect(() => statSync(join(REPO, 'zz-no-out', 'raw'))).toThrow();
    rmSync(join(REPO, 'zz-no-out'), { recursive: true, force: true });
  }, 60_000);

  it('refuses to start when a public host is reachable, and accepts only localhost backends', async () => {
    await expect(assertOffline(async () => true)).rejects.toMatchObject({
      code: 'E_NETWORK_REACHABLE',
    });
    await expect(assertOffline(async () => false)).resolves.toBeUndefined();
    expect(isLocalUrl('http://127.0.0.1:8080')).toBe(true);
    expect(isLocalUrl('http://localhost:11434')).toBe(true);
    expect(isLocalUrl('http://[::1]:8080')).toBe(true);
    expect(isLocalUrl('https://api.example.com')).toBe(false);
    expect(isLocalUrl('http://192.168.1.20:8080')).toBe(false);
  });
});
