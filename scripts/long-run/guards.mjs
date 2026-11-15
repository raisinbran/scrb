// Start-up checks for the overnight long run: where the evidence may go and how long a default run is.
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const DEFAULT_SECONDS = 300;

/** Resolves symlinks in the part of the path that exists, and keeps the rest as written. */
export function canonical(path) {
  let head = resolve(path);
  const tail = [];
  while (!existsSync(head) && dirname(head) !== head) {
    // A dangling symlink exists as a link but not as a target: refuse to guess where it points.
    try {
      lstatSync(head);
      throw new Error(`${head} is a broken link`);
    } catch (error) {
      if (error.message.endsWith('is a broken link')) throw error;
    }
    tail.unshift(basename(head));
    head = dirname(head);
  }
  return join(realpathSync(head), ...tail);
}

const inside = (child, parent) => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

/** The evidence folder must be new or empty, and neither the repository nor anything under it. */
export function assertEvidenceDir(work, repoRoots) {
  const target = canonical(work);
  for (const root of repoRoots) {
    const repo = canonical(root);
    if (inside(target, repo) || inside(repo, target)) {
      throw new Error(`the evidence folder ${target} must be outside the repository ${repo}`);
    }
  }
  if (existsSync(target)) {
    if (!lstatSync(target).isDirectory()) throw new Error(`${target} is not a folder`);
    if (readdirSync(target).length > 0) {
      throw new Error(`${target} is not empty: use a fresh folder for each run`);
    }
  }
  return target;
}

/** Anything longer than the 5-minute default must be asked for with an explicit duration. */
export function chooseSeconds(explicit) {
  if (explicit === undefined) return DEFAULT_SECONDS;
  const seconds = Number(explicit);
  if (!(seconds >= 60)) throw new Error('--seconds must be a number of at least 60');
  return seconds;
}

/**
 * Provisional, not calibrated. The jitter nets were chosen after one 5-minute smoke run and the Regiurn 8-hour run.
 * The marked-gap limits (owner decision 2026-11-15) rest on the AMI gap-size test: output changes step up at 20 ms
 * zero-filled gaps, so 10 ms per marked gap and 100 ms per run are the accepted provisional limits, frozen before
 * the Mac 8-hour run. They are policy, not statistics.
 */
export const LOST_AUDIO_LIMITS = {
  gapToleranceMs: 2,
  markedGapMaxMs: 10,
  markedTotalMaxMs: 100,
  netSmallHourMs: 10,
  netSmallRunMs: 100,
  netShortfallMs: 100,
  // Both one-sided totals above this while the net is small: the net alone does not show continuity.
  cancellingWarnMs: 100,
};

export const CANCELLING_WARNING = 'large cancelling jitter, continuity not independently shown';

/**
 * Walks one track's chunks. gap is relative to the previous end. A difference of toleranceMs or more in
 * EITHER direction is a finding and is never netted: a gap is lost audio (marked or unmarked), an overlap is
 * counted in bigOverlaps. Only differences smaller than the tolerance are timestamp jitter; those are netted as
 * a signed sum, over the whole run and per clock hour of the run, so the caller can bound the net.
 */
export function scanGaps(chunks, toleranceMs, isMarked, markedMaxMs = Infinity) {
  const out = {
    overlaps: 0, bigOverlaps: 0, largestOverlapNs: 0, unmarked: 0, lossNs: 0, longestNs: 0,
    markedFound: 0, markedNs: 0, markedOver: 0, longestMarkedNs: 0,
    posSmallNs: 0, negSmallNs: 0, netSmallNs: 0, worstHourNetNs: 0,
  };
  const perHour = new Map();
  const tolNs = toleranceMs * 1e6;
  for (let i = 0; i < chunks.length; i += 1) {
    const from = i === 0 ? 0 : chunks[i - 1].endNs;
    if (i === 0 && chunks[0].startNs < 100e6) continue;
    const gap = chunks[i].startNs - from;
    if (gap < 0) out.overlaps += 1;
    if (Math.abs(gap) < tolNs) {
      if (gap > 0) out.posSmallNs += gap;
      else out.negSmallNs += gap;
      out.netSmallNs += gap;
      const hour = Math.floor(chunks[i].startNs / 3.6e12);
      perHour.set(hour, (perHour.get(hour) ?? 0) + gap);
    } else if (gap < 0) {
      out.bigOverlaps += 1;
      out.largestOverlapNs = Math.max(out.largestOverlapNs, -gap);
    } else {
      out.lossNs += gap;
      out.longestNs = Math.max(out.longestNs, gap);
      if (!isMarked(from, chunks[i].startNs)) {
        out.unmarked += 1;
      } else {
        out.markedFound += 1;
        out.markedNs += gap;
        out.longestMarkedNs = Math.max(out.longestMarkedNs, gap);
        if (gap > markedMaxMs * 1e6) out.markedOver += 1;
      }
    }
  }
  for (const net of perHour.values()) out.worstHourNetNs = Math.max(out.worstHourNetNs, Math.abs(net));
  return out;
}

/**
 * Independent sample evidence for one track, from its chunk log (one JSON line per chunk). Frame counts are
 * counted samples, not timestamps. Every chunk must hold the frame count its own stamped span implies (within
 * one frame), every chunk closed by a rollover must hold the same count as the others, and none may carry a
 * padded span. A chunk with a missingCause is excused only when it is matched to a distinct helper-marked gap
 * span (markedSpans, each {startNs, endNs}, at most maxGapMs long) that touches the chunk; the number of
 * missingCause chunks must equal the number of marked spans, and an unmatched or too-long one is "bad". Missing or
 * unreadable data is "absent", never a pass.
 */
export function checkChunkFrames(logText, chunkCount, markedSpans = [], maxGapMs = LOST_AUDIO_LIMITS.markedGapMaxMs) {
  const lines = (logText ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { status: 'absent', detail: 'no chunk log' };
  let rows;
  try {
    rows = lines.map((l) => JSON.parse(l));
  } catch {
    return { status: 'absent', detail: 'chunk log unreadable' };
  }
  if (chunkCount !== undefined && rows.length !== chunkCount) {
    return { status: 'absent', detail: `chunk log has ${rows.length} lines for ${chunkCount} chunks` };
  }
  const counts = new Map();
  for (const r of rows) {
    if (r.closeReason === 'rollover') counts.set(r.frames, (counts.get(r.frames) ?? 0) + 1);
  }
  const expected = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  let wrong = 0;
  let padded = 0;
  let caused = 0;
  let inconsistent = 0;
  const free = markedSpans.map((span, index) => ({ span, index }));
  for (const r of rows) {
    const implied = (r.rate * (r.endNs - r.startNs)) / 1e9;
    const spanOk = Number.isInteger(r.frames) && r.rate > 0 && Math.abs(r.frames - implied) <= 1;
    const rolloverOk = r.closeReason !== 'rollover' || r.frames === expected;
    if (!spanOk || !rolloverOk) wrong += 1;
    if (Array.isArray(r.paddedSpans) && r.paddedSpans.length > 0) padded += 1;
    if (r.missingCause) {
      const at = free.findIndex(
        ({ span }) =>
          span.startNs <= r.endNs &&
          (span.endNs ?? span.startNs) >= r.startNs &&
          ((span.endNs ?? span.startNs) - span.startNs) / 1e6 <= maxGapMs,
      );
      if (at === -1) {
        caused += 1;
      } else {
        // The helper's own reported duration must agree with the measured span (1 ms of rounding allowed).
        const { span } = free[at];
        const measuredMs = ((span.endNs ?? span.startNs) - span.startNs) / 1e6;
        if (!(Math.abs((r.missingBeforeMs ?? NaN) - measuredMs) <= 1)) inconsistent += 1;
        free.splice(at, 1);
      }
    }
  }
  const unusedSpans = free.length;
  const detail =
    `${rows.length} chunks, ${wrong} without the expected frame count (${expected ?? 'none closed by rollover'} ` +
    `at rollover), ${padded} with a padded span, ${caused} with a missingCause not matched to a marked gap, ` +
    `${inconsistent} whose missingBeforeMs disagrees with the marked span, ` +
    `${unusedSpans} marked gaps without a missingCause chunk`;
  return { status: wrong + padded + caused + inconsistent + unusedSpans === 0 ? 'ok' : 'bad', detail };
}

/**
 * The marked gap spans the helper itself reported in a track's chunk log: every row with a missingCause, as the span
 * from the previous row's end (0 for the first) to its own start. Read from the original log so sealing, which drops
 * rollover gaps under 50 ms, cannot lose a helper marking. Unreadable or empty logs give no spans.
 */
export function markedSpansFromLog(logText) {
  const rows = [];
  for (const line of (logText ?? '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      return [];
    }
  }
  const spans = [];
  rows.forEach((row, i) => {
    if (row.missingCause) spans.push({ startNs: i === 0 ? 0 : rows[i - 1].endNs, endNs: row.startNs });
  });
  return spans;
}

/** The run-wide cap: marked gap time summed over every track, not per track. */
export function judgeMarkedRunTotal(verdicts, limits = LOST_AUDIO_LIMITS) {
  const totalNs = verdicts.reduce((sum, v) => sum + v.markedNs, 0);
  return {
    ok: totalNs <= limits.markedTotalMaxMs * 1e6,
    detail: `${(totalNs / 1e6).toFixed(1)} ms of marked gaps over all tracks (limit ${limits.markedTotalMaxMs} ms per run, provisional)`,
  };
}

/**
 * The decision for one track's "no lost audio" check: status FAIL, INCONCLUSIVE or PASS. marked is the helper's
 * list of marked gap spans for the track ({startNs, endNs}). A gap of the tolerance or more in the chunk
 * timestamps is allowed only if it exactly matches a distinct marked span, is at most markedGapMaxMs, and the
 * matched total is at most markedTotalMaxMs; anything else (unmarked gap, overlap, over-long marked gap, over-long
 * total) is a FAIL. If the marked list and the chunk gaps disagree in count, or the frame evidence is absent or
 * bad, the result is INCONCLUSIVE, never PASS. frames is checkChunkFrames' result.
 */
export function judgeLostAudio({ chunks, timelineEndNs, marked = [], frames, limits = LOST_AUDIO_LIMITS }) {
  const used = new Set();
  const isMarked = (from, to) => {
    const at = marked.findIndex(
      (span, i) => !used.has(i) && span.startNs === from && (span.endNs === undefined || span.endNs === to),
    );
    if (at === -1) return false;
    used.add(at);
    return true;
  };
  const r = scanGaps(chunks, limits.gapToleranceMs, isMarked, limits.markedGapMaxMs);
  const markedCount = marked.length;
  const audioNs = chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
  const shortfallNs = timelineEndNs - audioNs;
  const timestampsOk =
    r.unmarked === 0 &&
    r.markedOver === 0 &&
    r.markedNs <= limits.markedTotalMaxMs * 1e6 &&
    r.bigOverlaps === 0 &&
    Math.abs(r.netSmallNs) <= limits.netSmallRunMs * 1e6 &&
    r.worstHourNetNs <= limits.netSmallHourMs * 1e6 &&
    shortfallNs <= limits.netShortfallMs * 1e6;
  const listsAgree = r.markedFound === markedCount;
  const framesStatus = frames?.status ?? 'absent';
  const status = !timestampsOk
    ? 'FAIL'
    : listsAgree && framesStatus === 'ok'
      ? 'PASS'
      : 'INCONCLUSIVE';
  const sec = (ns) => (ns / 1e9).toFixed(3);
  const msf = (ns) => (ns / 1e6).toFixed(1);
  const cancelling =
    r.posSmallNs > limits.cancellingWarnMs * 1e6 && -r.negSmallNs > limits.cancellingWarnMs * 1e6;
  const detail =
    `gaps total ${sec(r.lossNs)} s, longest ${sec(r.longestNs)} s; ${markedCount} marked by the helper, ` +
    `${r.markedFound} matched (total ${msf(r.markedNs)} ms, limit ${limits.markedTotalMaxMs}; longest ` +
    `${msf(r.longestMarkedNs)} ms, limit ${limits.markedGapMaxMs} each; ${r.markedOver} over), ${r.unmarked} unmarked, ` +
    `${r.bigOverlaps} overlaps of ${limits.gapToleranceMs} ms or more (largest ${msf(r.largestOverlapNs)} ms), ` +
    `${r.overlaps} overlaps in all; under ${limits.gapToleranceMs} ms: +${msf(r.posSmallNs)} / ${msf(r.negSmallNs)} ms, ` +
    `net ${msf(r.netSmallNs)} ms (limit ${limits.netSmallRunMs}), worst hour net ${msf(r.worstHourNetNs)} ms ` +
    `(limit ${limits.netSmallHourMs}); audio ${sec(audioNs)} s of ${sec(timelineEndNs)} s ` +
    `(difference ${sec(shortfallNs)} s, limit ${limits.netShortfallMs} ms); ` +
    `${listsAgree ? 'marked list agrees with the chunk gaps' : 'marked list DISAGREES with the chunk gaps'}; ` +
    `sample evidence: ${framesStatus} (${frames?.detail ?? 'none'}); limits are provisional and not calibrated`;
  return {
    status,
    passed: status === 'PASS',
    detail,
    warning: status === 'PASS' && cancelling ? CANCELLING_WARNING : null,
    audioNs,
    ...r,
  };
}
