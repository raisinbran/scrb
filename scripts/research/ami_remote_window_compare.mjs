// Source-matched AMI screening: two runs of the same public window, differing only in threshold.
// This counts sustained reference-speaker separation; it is not DER or a production gate.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAmiMeetingId } from './ami_remote_workspace.mjs';

export function validatedWindow(window) {
  const meeting = requireAmiMeetingId(window?.meeting);
  const startSeconds = window.startSeconds;
  const durationSeconds = window.durationSeconds;
  if (
    !Number.isSafeInteger(startSeconds) ||
    startSeconds < 0 ||
    startSeconds > 36000 ||
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > 60
  ) {
    throw new Error('AMI window needs integer start 0..36000 and duration 1..60');
  }
  return { meeting, startSeconds, durationSeconds };
}

export function reportFilename(window, threshold) {
  const w = validatedWindow(window);
  if (threshold !== 1 && threshold !== 0.8) {
    throw new Error('paired thresholds must be 1.0 and 0.8');
  }
  return (
    w.meeting +
    '-' +
    w.startSeconds +
    '-' +
    w.durationSeconds +
    (threshold === 1 ? '-t1.json' : '-t08.json')
  );
}

function score(report) {
  const refs = report.referenceSpeakers;
  if (!Array.isArray(refs) || !Array.isArray(report.referenceAttribution)) {
    throw new Error('missing AMI reference attribution');
  }
  const sustained = refs.filter(
    (row) => Number.isFinite(row.annotatedSpeechSeconds) && row.annotatedSpeechSeconds >= 5,
  );
  const dominant = sustained.map((row) => {
    const matched = report.referenceAttribution.find((r) => r.referenceSpeaker === row.speaker);
    if (!matched || !matched.overlapByOutputSpeaker) {
      throw new Error('missing annotation speaker overlap');
    }
    const entries = Object.entries(matched.overlapByOutputSpeaker);
    if (entries.some(([id, seconds]) => !id || !Number.isFinite(seconds) || seconds < 0)) {
      throw new Error('invalid overlap measurements');
    }
    entries.sort((a, b) => b[1] - a[1]);
    const first = entries[0];
    const overlap = first?.[1] ?? 0;
    return overlap >= Math.max(1, row.annotatedSpeechSeconds * 0.25) ? first[0] : null;
  });
  let separatedPairs = 0;
  for (let i = 0; i < dominant.length; i++) {
    for (let j = i + 1; j < dominant.length; j++) {
      if (dominant[i] && dominant[j] && dominant[i] !== dominant[j]) separatedPairs++;
    }
  }
  const outputCount = report.output?.finalSpeakerCount;
  if (!Number.isSafeInteger(outputCount) || outputCount < 0) {
    throw new Error('invalid output speaker count');
  }
  return {
    sustainedReferenceCount: sustained.length,
    outputCount,
    separatedPairs,
    pairCount: (sustained.length * (sustained.length - 1)) / 2,
    unresolvedReferenceCount: dominant.filter((x) => !x).length,
  };
}

export function evaluatePair(baseline, candidate) {
  const window = validatedWindow(baseline?.sourceWindow);
  if (
    JSON.stringify(window) !== JSON.stringify(validatedWindow(candidate?.sourceWindow)) ||
    baseline.schemaVersion !== 1 ||
    candidate.schemaVersion !== 1 ||
    baseline.sourceCommit !== candidate.sourceCommit ||
    baseline.sourceAudio !== candidate.sourceAudio ||
    baseline.defaultDiarizationThreshold !== 1 ||
    candidate.defaultDiarizationThreshold !== 1 ||
    baseline.evaluatedDiarizationThreshold !== 1 ||
    candidate.evaluatedDiarizationThreshold !== 0.8 ||
    baseline.evaluatedShortMergeLine !== 0.85 ||
    candidate.evaluatedShortMergeLine !== 0.85 ||
    JSON.stringify(baseline.referenceSpeakers) !== JSON.stringify(candidate.referenceSpeakers) ||
    ['speechModel', 'segmentationModel', 'embeddingModel'].some(
      (key) => baseline.diagnostics?.[key] !== candidate.diagnostics?.[key],
    )
  ) {
    throw new Error('paired reports must match their sources, models and relabel options');
  }
  const a = score(baseline);
  const b = score(candidate);
  if (a.sustainedReferenceCount !== b.sustainedReferenceCount) {
    throw new Error('inconsistent annotation');
  }
  const regressions = [];
  if (b.separatedPairs < a.separatedPairs) {
    regressions.push('lost-pair-separation');
  }
  if (a.sustainedReferenceCount === 1 && b.outputCount > a.outputCount) {
    regressions.push('possible-solo-oversplit');
  }
  if (a.sustainedReferenceCount >= 2 && b.outputCount > a.outputCount + 2) {
    regressions.push('possible-multivoice-oversplit');
  }
  return { window, baseline: a, candidate: b, regressions };
}

export function summarizePairs(pairs) {
  const windows = new Set();
  for (const pair of pairs) {
    const key = JSON.stringify(pair.window);
    if (windows.has(key)) throw new Error('duplicate evaluated window');
    windows.add(key);
  }
  const cohorts = {
    solo: pairs.filter((p) => p.baseline.sustainedReferenceCount === 1).length,
    pair: pairs.filter((p) => p.baseline.sustainedReferenceCount === 2).length,
    busy: pairs.filter((p) => p.baseline.sustainedReferenceCount >= 3).length,
  };
  const meetings = new Set(pairs.map((p) => p.window.meeting));
  const diverse =
    pairs.length >= 12 &&
    meetings.size >= 6 &&
    cohorts.solo >= 3 &&
    cohorts.pair >= 3 &&
    cohorts.busy >= 3;
  const regressions = pairs.filter((p) => p.regressions.length > 0);
  return {
    schemaVersion: 1,
    baselineThreshold: 1,
    candidateThreshold: 0.8,
    pairedWindowCount: pairs.length,
    distinctMeetings: meetings.size,
    cohorts,
    improvedSeparationWindows: pairs.filter(
      (p) => p.candidate.separatedPairs > p.baseline.separatedPairs,
    ).length,
    regressionWindows: regressions.length,
    screeningOutcome: !diverse
      ? 'INSUFFICIENT_DIVERSE_EVIDENCE'
      : regressions.length
        ? 'REGRESSION_WARNINGS'
        : 'NO_REGRESSION_IN_THIS_SCREEN',
    productionRecommendation: 'NOT ESTABLISHED: not DER or M1 acceptance',
    windows: pairs,
  };
}

export async function compareManifest(manifestPath, reportsDir, outputPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (
    !Array.isArray(manifest.windows) ||
    manifest.windows.length < 1 ||
    manifest.windows.length > 100
  ) {
    throw new Error('manifest must have 1..100 windows');
  }
  const pairs = [];
  for (const window of manifest.windows) {
    const w = validatedWindow(window);
    const baseline = JSON.parse(await readFile(join(reportsDir, reportFilename(w, 1)), 'utf8'));
    const candidate = JSON.parse(await readFile(join(reportsDir, reportFilename(w, 0.8)), 'utf8'));
    pairs.push(evaluatePair(baseline, candidate));
  }
  const result = summarizePairs(pairs);
  await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifest, reportDir, output] = process.argv.slice(2);
  if (!manifest || !reportDir || !output) {
    throw new Error('usage: node ami_remote_window_compare.mjs <manifest.json> <reportsDir> <new-summary.json>');
  }
  console.log(JSON.stringify(await compareManifest(manifest, reportDir, output)));
}
