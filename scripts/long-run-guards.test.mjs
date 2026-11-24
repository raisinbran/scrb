import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  DEFAULT_SECONDS,
  LOST_AUDIO_LIMITS,
  assertEvidenceDir,
  checkChunkFrames,
  chooseSeconds,
  judgeLostAudio,
  judgeMarkedRunTotal,
  markedSpansFromLog,
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
  const judge = (chunks, marked = []) =>
    judgeLostAudio({
      chunks,
      timelineEndNs: chunks.at(-1).endNs,
      marked,
      frames: { status: 'ok', detail: 'test' },
    });

  it('FAILS 50 gaps of +1.9 ms plus one -95 ms overlap', () => {
    const v = judge(chunksWithGaps([...Array(50).fill(1.9e6), -95e6]));
    expect(v.passed).toBe(false);
    expect(v.detail).toContain('1 overlaps of 2 ms or more (largest 95.0 ms)');
    expect(v.warning).toBeNull();
  });

  it('PASSES pure alternating +/-1.9 ms jitter, with the cancelling-jitter warning', () => {
    const v = judge(
      chunksWithGaps(Array.from({ length: 480 }, (_, i) => (i % 2 === 0 ? 1.9e6 : -1.9e6))),
    );
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

  it('is INCONCLUSIVE, not PASS, when the timestamps look fine but the frame evidence is absent or disagrees', () => {
    const chunks = chunksWithGaps([0.5e6, -0.5e6]);
    const base = { chunks, timelineEndNs: chunks.at(-1).endNs, marked: [] };
    expect(
      judgeLostAudio({ ...base, frames: { status: 'absent', detail: 'no chunk log' } }).status,
    ).toBe('INCONCLUSIVE');
    expect(judgeLostAudio({ ...base, frames: { status: 'bad', detail: 'x' } }).status).toBe(
      'INCONCLUSIVE',
    );
    expect(judgeLostAudio(base).status).toBe('INCONCLUSIVE');
    expect(judgeLostAudio({ ...base, frames: { status: 'ok', detail: '' } }).status).toBe('PASS');
  });

  it('FAILS one 8 ms gap, unmarked; a matched marked 8 ms gap passes', () => {
    const chunks = chunksWithGaps([8e6]);
    const unmarked = judge(chunks);
    expect(unmarked.status).toBe('FAIL');
    expect(unmarked.detail).toContain('0 marked by the helper, 0 matched');
    expect(unmarked.detail).toContain('1 unmarked');
    const marked = judge(chunks, [{ startNs: chunks[0].endNs, endNs: chunks[1].startNs }]);
    expect(marked.status).toBe('PASS');
    expect(marked.detail).toContain('1 marked by the helper, 1 matched');
  });

  it('is INCONCLUSIVE, not a pass, when a marked gap is not found in the chunks', () => {
    expect(judge(chunksWithGaps([0.1e6]), [{ startNs: 30e9, endNs: 38e9 }]).status).toBe(
      'INCONCLUSIVE',
    );
  });
  it('FAILS an accumulating small loss and a large net shortfall', () => {
    expect(judge(chunksWithGaps(Array(300).fill(0.5e6))).passed).toBe(false);
    const chunks = chunksWithGaps([0.1e6]);
    const v = judgeLostAudio({
      chunks,
      timelineEndNs: chunks.at(-1).endNs + 150e6,
      marked: [],
      frames: { status: 'ok', detail: 'test' },
    });
    expect(v.passed).toBe(false);
  });

  describe('tiers (owner decision 2026-11-15: 10 ms per marked gap, 100 ms per run, provisional)', () => {
    const span = (chunks, i, endNs = chunks[i + 1].startNs) => ({
      startNs: chunks[i].endNs,
      endNs,
    });
    const marked1 = (gapNs) => {
      const chunks = chunksWithGaps([gapNs]);
      return judge(chunks, [span(chunks, 0)]);
    };

    it('nets a 1.9 ms gap or overlap; fails any unmarked 2 ms gap or overlap', () => {
      expect(judge(chunksWithGaps([1.9e6])).status).toBe('PASS');
      expect(judge(chunksWithGaps([-1.9e6])).status).toBe('PASS');
      expect(judge(chunksWithGaps([2e6])).status).toBe('FAIL');
      expect(judge(chunksWithGaps([-2e6])).status).toBe('FAIL');
      expect(judge(chunksWithGaps([2e6]), []).detail).toContain('1 unmarked');
    });

    it('passes a matched marked gap at 2 ms and exactly 10 ms, fails at 10.1 ms', () => {
      expect(marked1(2e6).status).toBe('PASS');
      expect(marked1(10e6).status).toBe('PASS');
      const over = marked1(10.1e6);
      expect(over.status).toBe('FAIL');
      expect(over.detail).toContain('1 over');
    });

    it('passes marked gaps totalling exactly 100 ms, fails at 100.1 ms', () => {
      const run = (sizes) => {
        const chunks = chunksWithGaps(sizes);
        return judge(
          chunks,
          sizes.map((_, i) => span(chunks, i)),
        );
      };
      expect(run(Array(10).fill(10e6)).status).toBe('PASS');
      expect(run([...Array(9).fill(10e6), 5e6, 5e6]).status).toBe('PASS');
      expect(run([...Array(9).fill(10e6), 5e6, 5.1e6]).status).toBe('FAIL');
    });

    it('requires an exact match: wrong start or wrong end is unmarked and FAILS', () => {
      const chunks = chunksWithGaps([8e6]);
      expect(
        judge(chunks, [{ startNs: chunks[0].endNs + 1, endNs: chunks[1].startNs }]).status,
      ).toBe('FAIL');
      expect(
        judge(chunks, [{ startNs: chunks[0].endNs, endNs: chunks[1].startNs - 1 }]).status,
      ).toBe('FAIL');
    });

    it('is INCONCLUSIVE when the marked list has more entries than the chunk gaps, and counts must agree', () => {
      const chunks = chunksWithGaps([8e6]);
      const real = span(chunks, 0);
      expect(judge(chunks, [real, { startNs: 99e9, endNs: 99.005e9 }]).status).toBe('INCONCLUSIVE');
      // one marked span cannot excuse two identical-looking gaps
      const two = chunksWithGaps([8e6, 8e6]);
      expect(judge(two, [span(two, 0)]).status).toBe('FAIL');
    });

    it('is INCONCLUSIVE with a good marked gap but missing or bad frame evidence', () => {
      const chunks = chunksWithGaps([8e6]);
      const base = { chunks, timelineEndNs: chunks.at(-1).endNs, marked: [span(chunks, 0)] };
      expect(judgeLostAudio({ ...base, frames: { status: 'absent', detail: '' } }).status).toBe(
        'INCONCLUSIVE',
      );
      expect(judgeLostAudio({ ...base, frames: { status: 'bad', detail: '' } }).status).toBe(
        'INCONCLUSIVE',
      );
    });

    it('still FAILS an overlap of 2 ms or more even with marked gaps present', () => {
      const chunks = chunksWithGaps([8e6, -3e6]);
      expect(judge(chunks, [span(chunks, 0)]).status).toBe('FAIL');
    });

    it('feeds the final PASS/FAIL line: only PASS counts as passed', () => {
      expect(marked1(8e6).passed).toBe(true);
      expect(marked1(12e6).passed).toBe(false);
    });
  });
});

describe('tone-check --chunks', () => {
  const run = (value) =>
    spawnSync(process.execPath, ['scripts/long-run/tone-check.mjs', tmpdir(), '--chunks', value], {
      encoding: 'utf8',
    });
  it.each(['0', '-1', '2.5', 'abc'])('rejects %s before checking any audio', (value) => {
    const r = run(value);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--chunks must be a whole number');
  });
});

describe('checkChunkFrames', () => {
  const line = (o = {}) =>
    JSON.stringify({
      seq: 0,
      startNs: 0,
      endNs: 5e9,
      frames: 240000,
      rate: 48000,
      closeReason: 'rollover',
      paddedSpans: [],
      missingCause: '',
      ...o,
    });
  const log = (...rows) => rows.join(String.fromCharCode(10));

  it('accepts chunks whose frame counts match their spans and each other', () => {
    expect(checkChunkFrames(log(line(), line({ startNs: 5e9, endNs: 10e9 })), 2).status).toBe('ok');
  });

  it('accepts a short chunk closed by a discontinuity if its frames match its own span', () => {
    const short = line({
      startNs: 5e9,
      endNs: 5e9 + 1e9,
      frames: 48000,
      closeReason: 'discontinuity',
    });
    expect(checkChunkFrames(log(line(), short), 2).status).toBe('ok');
  });

  it('flags a wrong frame count, a padded span and a missingCause', () => {
    expect(checkChunkFrames(log(line(), line({ frames: 239000 })), 2).status).toBe('bad');
    expect(
      checkChunkFrames(
        log(line(), line({ closeReason: 'rollover', frames: 239000, endNs: 5e9 - 20833333 })),
        2,
      ).status,
    ).toBe('bad');
    expect(
      checkChunkFrames(log(line(), line({ paddedSpans: [{ startNs: 1, endNs: 2 }] })), 2).status,
    ).toBe('bad');
    expect(checkChunkFrames(log(line(), line({ missingCause: 'unknown' })), 2).status).toBe('bad');
  });

  it('excuses a missingCause chunk only when matched to a distinct marked span of at most 10 ms', () => {
    const caused = line({ startNs: 5e9, endNs: 10e9, missingCause: 'unknown', missingBeforeMs: 8 });
    const span = { startNs: 5e9 - 8e6, endNs: 5e9 };
    expect(checkChunkFrames(log(line(), caused), 2, [span]).status).toBe('ok');
    expect(checkChunkFrames(log(line(), caused), 2, []).status).toBe('bad');
    expect(
      checkChunkFrames(log(line(), caused), 2, [{ startNs: 5e9 - 10.1e6, endNs: 5e9 }]).status,
    ).toBe('bad');
    expect(
      checkChunkFrames(log(line(), caused), 2, [{ startNs: 50e9, endNs: 50.008e9 }]).status,
    ).toBe('bad');
    // a marked span with no missingCause chunk, or two chunks for one span
    expect(
      checkChunkFrames(log(line(), line({ startNs: 5e9, endNs: 10e9 })), 2, [span]).status,
    ).toBe('bad');
    const second = line({
      startNs: 10e9,
      endNs: 15e9,
      missingCause: 'unknown',
      missingBeforeMs: 8,
    });
    expect(checkChunkFrames(log(line(), caused, second), 3, [span]).status).toBe('bad');
  });

  it('is bad when the helper-reported missingBeforeMs disagrees with the marked span', () => {
    const span = { startNs: 5e9 - 8e6, endNs: 5e9 };
    const row = (ms) =>
      line({ startNs: 5e9, endNs: 10e9, missingCause: 'unknown', missingBeforeMs: ms });
    expect(checkChunkFrames(log(line(), row(0)), 2, [span]).status).toBe('bad');
    expect(checkChunkFrames(log(line(), row(9.5)), 2, [span]).status).toBe('bad');
    expect(checkChunkFrames(log(line(), row(8.4)), 2, [span]).status).toBe('ok');
  });

  it('reads helper markings from the original chunk log', () => {
    const rows = log(
      line(),
      line({ startNs: 5e9 + 8e6, endNs: 10e9, missingCause: 'unknown' }),
      line({ startNs: 10e9, endNs: 15e9 }),
    );
    expect(markedSpansFromLog(rows)).toEqual([{ startNs: 5e9, endNs: 5e9 + 8e6 }]);
    expect(markedSpansFromLog('')).toEqual([]);
    expect(markedSpansFromLog('not json')).toEqual([]);
  });

  it('caps marked gaps over the whole run, summed over tracks', () => {
    const v = (ms) => ({ markedNs: ms * 1e6 });
    expect(judgeMarkedRunTotal([v(50), v(50)]).ok).toBe(true);
    expect(judgeMarkedRunTotal([v(60), v(60)]).ok).toBe(false);
    expect(judgeMarkedRunTotal([v(50), v(50.1)]).ok).toBe(false);
  });

  it('still checks the frame count, padding and rollover of an excused chunk', () => {
    const span = { startNs: 5e9 - 8e6, endNs: 5e9 };
    const bad = line({
      startNs: 5e9,
      endNs: 10e9,
      missingCause: 'unknown',
      missingBeforeMs: 8,
      frames: 239000,
    });
    expect(checkChunkFrames(log(line(), bad), 2, [span]).status).toBe('bad');
    const padded = line({
      startNs: 5e9,
      endNs: 10e9,
      missingCause: 'unknown',
      paddedSpans: [{ startNs: 1, endNs: 2 }],
    });
    expect(checkChunkFrames(log(line(), padded), 2, [span]).status).toBe('bad');
  });

  it('is absent when the log is empty, unreadable or does not match the chunk count', () => {
    expect(checkChunkFrames('', 2).status).toBe('absent');
    expect(checkChunkFrames(undefined, 2).status).toBe('absent');
    expect(checkChunkFrames('not json', 1).status).toBe('absent');
    expect(checkChunkFrames(line(), 2).status).toBe('absent');
  });
});
