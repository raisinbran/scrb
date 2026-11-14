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
  // Invented 30 s chunks; gaps[i] is the signed difference (ns) before chunk i+1 (negative = overlap).
  const chunksWithGaps = (gaps) => {
    const out = [{ seq: 0, startNs: 0, endNs: 30e9 }];
    for (let i = 0; i < gaps.length; i += 1) {
      const start = out[i].endNs + gaps[i];
      out.push({ seq: i + 1, startNs: start, endNs: start + 30e9 });
    }
    return out;
  };
  const same = (gapNs, count) => chunksWithGaps(Array.from({ length: count }, () => gapNs));
  const none = () => false;
  const HOUR_LIMIT_NS = 10e6; // LIMITS.netSmallHourMs
  const RUN_LIMIT_NS = 100e6; // LIMITS.netSmallRunMs

  it('nets cancelling jitter: big one-sided sums, tiny net, within both limits', () => {
    // +1.9 ms then -1.9 ms, like the Regiurn microphone track; 480 chunks = 4 hours.
    const r = scanGaps(chunksWithGaps(Array.from({ length: 480 }, (_, i) => (i % 2 === 0 ? 1.9e6 : -1.9e6))), 2, none);
    expect(r.lossNs).toBe(0);
    expect(r.unmarked).toBe(0);
    expect(r.posSmallNs).toBeCloseTo(240 * 1.9e6, -3);
    expect(r.negSmallNs).toBeCloseTo(-240 * 1.9e6, -3);
    expect(r.posSmallNs).toBeGreaterThan(RUN_LIMIT_NS); // the old one-sided budget would have failed this
    expect(Math.abs(r.netSmallNs)).toBeLessThan(RUN_LIMIT_NS);
    expect(r.worstHourNetNs).toBeLessThan(HOUR_LIMIT_NS);
  });

  it('still fails a real accumulating loss of small gaps', () => {
    const r = scanGaps(same(0.5e6, 300), 2, none); // 0.5 ms before each of 300 chunks
    expect(r.lossNs).toBe(0); // each one is under the tolerance
    expect(r.netSmallNs).toBeGreaterThan(RUN_LIMIT_NS);
    expect(r.worstHourNetNs).toBeGreaterThan(HOUR_LIMIT_NS);
  });

  it('fails a loss that stays under the whole-run limit but piles up inside one hour', () => {
    const r = scanGaps(same(0.5e6, 100), 2, none); // 50 ms in under an hour
    expect(r.netSmallNs).toBeLessThan(RUN_LIMIT_NS);
    expect(r.worstHourNetNs).toBeGreaterThan(HOUR_LIMIT_NS);
  });

  it('counts a single 8 ms gap as lost audio, unmarked', () => {
    const r = scanGaps(chunksWithGaps([0.1e6, 8e6, -0.1e6]), 2, none);
    expect(r.lossNs).toBe(8e6);
    expect(r.longestNs).toBe(8e6);
    expect(r.unmarked).toBe(1);
  });

  it('reports a marked gap as lost audio but not as unmarked', () => {
    const chunks = chunksWithGaps([8e6]);
    const r = scanGaps(chunks, 2, (from) => from === chunks[0].endNs);
    expect(r.lossNs).toBe(8e6);
    expect(r.unmarked).toBe(0);
  });

  it('never nets a large gap against an overlap', () => {
    const r = scanGaps(chunksWithGaps([8e6, -8e6]), 2, none);
    expect(r.lossNs).toBe(8e6);
    expect(r.overlaps).toBe(1);
    expect(r.unmarked).toBe(1);
  });

  it('counts a gap at the tolerance as lost audio', () => {
    const r = scanGaps(same(2e6, 2), 2, none);
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
