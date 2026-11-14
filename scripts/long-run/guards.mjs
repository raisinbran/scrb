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

/** Provisional: chosen after seeing three runs (smoke, Regiurn 8 h mic and meeting), not calibrated. */
export const LOST_AUDIO_LIMITS = {
  gapToleranceMs: 2,
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
export function scanGaps(chunks, toleranceMs, isMarked) {
  const out = {
    overlaps: 0, bigOverlaps: 0, largestOverlapNs: 0, unmarked: 0, lossNs: 0, longestNs: 0,
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
      if (!isMarked(from)) out.unmarked += 1;
    }
  }
  for (const net of perHour.values()) out.worstHourNetNs = Math.max(out.worstHourNetNs, Math.abs(net));
  return out;
}

/**
 * The pass/fail decision for one track's "no lost audio" check. markedCount is how many marked gap spans the
 * helper recorded for the track. Netting measures timestamp jitter only; it is not proof of continuous audio.
 */
export function judgeLostAudio({ chunks, timelineEndNs, markedCount, isMarked, limits = LOST_AUDIO_LIMITS }) {
  const r = scanGaps(chunks, limits.gapToleranceMs, isMarked);
  const audioNs = chunks.reduce((sum, chunk) => sum + chunk.endNs - chunk.startNs, 0);
  const shortfallNs = timelineEndNs - audioNs;
  const passed =
    r.lossNs === 0 &&
    r.unmarked === 0 &&
    markedCount === 0 &&
    r.bigOverlaps === 0 &&
    Math.abs(r.netSmallNs) <= limits.netSmallRunMs * 1e6 &&
    r.worstHourNetNs <= limits.netSmallHourMs * 1e6 &&
    shortfallNs <= limits.netShortfallMs * 1e6;
  const sec = (ns) => (ns / 1e9).toFixed(3);
  const msf = (ns) => (ns / 1e6).toFixed(1);
  const cancelling =
    r.posSmallNs > limits.cancellingWarnMs * 1e6 && -r.negSmallNs > limits.cancellingWarnMs * 1e6;
  const detail =
    `gaps total ${sec(r.lossNs)} s, longest ${sec(r.longestNs)} s, ${markedCount} marked, ${r.unmarked} unmarked, ` +
    `${r.bigOverlaps} overlaps of ${limits.gapToleranceMs} ms or more (largest ${msf(r.largestOverlapNs)} ms), ` +
    `${r.overlaps} overlaps in all; under ${limits.gapToleranceMs} ms: +${msf(r.posSmallNs)} / ${msf(r.negSmallNs)} ms, ` +
    `net ${msf(r.netSmallNs)} ms (limit ${limits.netSmallRunMs}), worst hour net ${msf(r.worstHourNetNs)} ms ` +
    `(limit ${limits.netSmallHourMs}); audio ${sec(audioNs)} s of ${sec(timelineEndNs)} s ` +
    `(difference ${sec(shortfallNs)} s, limit ${limits.netShortfallMs} ms); netting limits are provisional, ` +
    `chosen after seeing three runs, not calibrated`;
  return { passed, detail, warning: passed && cancelling ? CANCELLING_WARNING : null, audioNs, ...r };
}
