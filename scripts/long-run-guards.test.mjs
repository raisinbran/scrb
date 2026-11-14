import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DEFAULT_SECONDS, assertEvidenceDir, chooseSeconds, scanGaps } from './long-run/guards.mjs';

let base;
let repo;
let outside;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'long-run-')));
  repo = join(base, 'repo');
  outside = join(base, 'evidence');
  mkdirSync(join(repo, 'sub'), { recursive: true });
  mkdirSync(outside);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('assertEvidenceDir', () => {
  it('accepts a new folder and an empty folder outside the repository', () => {
    expect(assertEvidenceDir(join(outside, 'new', 'run'), [repo])).toBe(
      join(outside, 'new', 'run'),
    );
    expect(assertEvidenceDir(outside, [repo])).toBe(outside);
  });

  it('rejects the repository, its descendants and its ancestors, even as relative paths', () => {
    const before = process.cwd();
    try {
      process.chdir(repo);
      expect(() => assertEvidenceDir('.', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('sub', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('./sub/../sub/new', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('..', [repo])).toThrow(/outside the repository/);
    } finally {
      process.chdir(before);
    }
  });

  it('rejects a symlink that leads into the repository, also through a new child', () => {
    const link = join(outside, 'link');
    symlinkSync(join(repo, 'sub'), link);
    expect(() => assertEvidenceDir(link, [repo])).toThrow(/outside the repository/);
    expect(() => assertEvidenceDir(join(link, 'fresh'), [repo])).toThrow(/outside the repository/);
  });

  it('rejects a folder inside any of several repository roots', () => {
    expect(() => assertEvidenceDir(join(outside, 'x'), [repo, outside])).toThrow(/outside/);
  });

  it('rejects a folder that already holds logs but no audio, and a plain file', () => {
    mkdirSync(join(outside, 'old', 'logs'), { recursive: true });
    expect(() => assertEvidenceDir(join(outside, 'old'), [repo])).toThrow(/not empty/);
    writeFileSync(join(outside, 'file'), '');
    expect(() => assertEvidenceDir(join(outside, 'file'), [repo])).toThrow(/not a folder/);
  });
});

describe('chooseSeconds', () => {
  it('defaults to 5 minutes and takes longer runs only when given', () => {
    expect(chooseSeconds(undefined)).toBe(DEFAULT_SECONDS);
    expect(DEFAULT_SECONDS).toBe(300);
    expect(chooseSeconds('28800')).toBe(28800);
    expect(() => chooseSeconds('10')).toThrow();
    expect(() => chooseSeconds('abc')).toThrow();
  });
});

describe('scanGaps', () => {
  // Invented chunks of 30 s; gapNs is the silence before each chunk after the first.
  const chunksWith = (gapNs, count) => {
    const out = [];
    let at = 0;
    for (let i = 0; i < count; i += 1) {
      const start = i === 0 ? 0 : at + gapNs;
      out.push({ seq: i, startNs: start, endNs: start + 30e9 });
      at = start + 30e9;
    }
    return out;
  };
  const none = () => false;

  it('adds up gaps under the tolerance without calling them lost audio', () => {
    const r = scanGaps(chunksWith(1.9e6, 101), 2, none);
    expect(r.lossNs).toBe(0);
    expect(r.unmarked).toBe(0);
    expect(r.smallNs).toBeCloseTo(100 * 1.9e6, -3);
    expect(r.smallNs).toBeGreaterThan(100e6); // over the 100 ms budget, so verify() fails the track
  });

  it('keeps a few tiny gaps under the budget', () => {
    const r = scanGaps(chunksWith(0.1e6, 6), 2, none);
    expect(r.smallNs).toBeCloseTo(5 * 0.1e6, -3);
    expect(r.smallNs).toBeLessThan(100e6);
  });

  it('counts a gap at the tolerance as lost audio', () => {
    const r = scanGaps(chunksWith(2e6, 3), 2, none);
    expect(r.lossNs).toBe(4e6);
    expect(r.unmarked).toBe(2);
  });
});

describe('tone-check --chunks', () => {
  const run = (value) =>
    spawnSync(process.execPath, ['scripts/long-run/tone-check.mjs', tmpdir(), '--chunks', value], { encoding: 'utf8' });
  it.each(['0', '-1', '2.5', 'abc'])('rejects %s before checking any audio', (value) => {
    const r = run(value);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--chunks must be a whole number');
  });
});
