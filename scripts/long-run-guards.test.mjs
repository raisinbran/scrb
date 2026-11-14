import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_SECONDS,
  LOST_AUDIO_LIMITS,
  assertEvidenceDir,
  chooseSeconds,
  judgeLostAudio,
  scanGaps,
} from './long-run/guards.mjs';

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
  const jitter = (pairs) =>
    chunksWithGaps(Array.from({ length: pairs * 2 }, (_, i) => (i % 2 === 0 ? 1.9e6 : -1.9e6)));
  const none = () => false;

  it('nets cancelling jitter below the tolerance: big one-sided sums, tiny net', () => {
    const r = scanGaps(jitter(240), 2, none);
    expect(r.lossNs).toBe(0);
    expect(r.bigOverlaps).toBe(0);
    expect(r.posSmallNs).toBeCloseTo(240 * 1.9e6, -3);
    expect(r.negSmallNs).toBeCloseTo(-240 * 1.9e6, -3);
    expect(Math.abs(r.netSmallNs)).toBeLessThan(LOST_AUDIO_LIMITS.netSmallRunMs * 1e6);
    expect(r.worstHourNetNs).toBeLessThan(LOST_AUDIO_LIMITS.netSmallHourMs * 1e6);
  });

  it('never nets an overlap of the tolerance or more: it is its own finding', () => {
    const r = scanGaps(chunksWithGaps([...Array(50).fill(1.9e6), -95e6]), 2, none);
    expect(r.bigOverlaps).toBe(1);
    expect(r.largestOverlapNs).toBe(95e6);
    expect(r.overlaps).toBe(1);
    expect(r.negSmallNs).toBe(0); // the 95 ms overlap is not in the small totals
    expect(r.netSmallNs).toBeCloseTo(50 * 1.9e6, -3);
    const exact = scanGaps(chunksWithGaps([-2e6]), 2, none);
    expect(exact.bigOverlaps).toBe(1);
  });

  it('still fails a real accumulating loss of small gaps', () => {
    const r = scanGaps(same(0.5e6, 300), 2, none);
    expect(r.lossNs).toBe(0);
    expect(r.netSmallNs).toBeGreaterThan(LOST_AUDIO_LIMITS.netSmallRunMs * 1e6);
    expect(r.worstHourNetNs).toBeGreaterThan(LOST_AUDIO_LIMITS.netSmallHourMs * 1e6);
  });

  it('fails a loss that stays under the whole-run limit but piles up inside one hour', () => {
    const r = scanGaps(same(0.5e6, 100), 2, none);
    expect(r.netSmallNs).toBeLessThan(LOST_AUDIO_LIMITS.netSmallRunMs * 1e6);
    expect(r.worstHourNetNs).toBeGreaterThan(LOST_AUDIO_LIMITS.netSmallHourMs * 1e6);
  });

  it('counts a single 8 ms gap as lost audio, unmarked; a marked one is not unmarked', () => {
    const chunks = chunksWithGaps([0.1e6, 8e6, -0.1e6]);
    const a = scanGaps(chunks, 2, none);
    expect([a.lossNs, a.longestNs, a.unmarked]).toEqual([8e6, 8e6, 1]);
    const b = scanGaps(chunks, 2, (from) => from === chunks[1].endNs);
    expect([b.lossNs, b.unmarked]).toEqual([8e6, 0]);
  });

  it('counts a gap at the tolerance as lost audio', () => {
    const r = scanGaps(same(2e6, 2), 2, none);
    expect(r.lossNs).toBe(4e6);
    expect(r.unmarked).toBe(2);
  });
});

describe('judgeLostAudio (the "no lost audio" decision)', () => {
  const chunksWithGaps = (gaps) => {
    const out = [{ seq: 0, startNs: 0, endNs: 30e9 }];
    for (let i = 0; i < gaps.length; i += 1) {
      const start = out[i].endNs + gaps[i];
      out.push({ seq: i + 1, startNs: start, endNs: start + 30e9 });
    }
    return out;
  };
  const judge = (chunks, markedCount = 0, isMarked = () => false) =>
    judgeLostAudio({ chunks, timelineEndNs: chunks.at(-1).endNs, markedCount, isMarked });

  it('FAILS 50 gaps of +1.9 ms plus one -95 ms overlap', () => {
    const v = judge(chunksWithGaps([...Array(50).fill(1.9e6), -95e6]));
    expect(v.passed).toBe(false);
    expect(v.detail).toContain('1 overlaps of 2 ms or more (largest 95.0 ms)');
    expect(v.warning).toBeNull();
  });

  it('PASSES pure alternating +/-1.9 ms jitter, with the cancelling-jitter warning', () => {
    const v = judge(chunksWithGaps(Array.from({ length: 480 }, (_, i) => (i % 2 === 0 ? 1.9e6 : -1.9e6))));
    expect(v.passed).toBe(true);
    expect(v.warning).toBe('large cancelling jitter, continuity not independently shown');
    expect(v.detail).toContain('provisional');
    expect(v.detail).toContain('not calibrated');
  });

  it('PASSES small cancelling jitter without the warning', () => {
    const v = judge(chunksWithGaps([0.5e6, -0.5e6, 0.4e6, -0.4e6]));
    expect(v.passed).toBe(true);
    expect(v.warning).toBeNull();
  });

  it('FAILS one 8 ms gap, unmarked, and reports it separately from a marked one', () => {
    const chunks = chunksWithGaps([8e6]);
    const unmarked = judge(chunks);
    expect(unmarked.passed).toBe(false);
    expect(unmarked.detail).toContain('0 marked, 1 unmarked');
    const marked = judge(chunks, 1, (from) => from === chunks[0].endNs);
    expect(marked.passed).toBe(false);
    expect(marked.detail).toContain('1 marked, 0 unmarked');
  });

  it('FAILS a marked gap even when no gap is found in the chunks', () => {
    expect(judge(chunksWithGaps([0.1e6]), 1).passed).toBe(false);
  });

  it('FAILS an accumulating small loss and a large net shortfall', () => {
    expect(judge(chunksWithGaps(Array(300).fill(0.5e6))).passed).toBe(false);
    const chunks = chunksWithGaps([0.1e6]);
    const v = judgeLostAudio({ chunks, timelineEndNs: chunks.at(-1).endNs + 150e6, markedCount: 0, isMarked: () => false });
    expect(v.passed).toBe(false);
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
