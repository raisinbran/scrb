import { describe, expect, it } from 'vitest';
import {
  evaluatePair,
  reportFilename,
  summarizePairs,
} from './research/ami_remote_window_compare.mjs';

const window = { meeting: 'ES2004a', startSeconds: 529, durationSeconds: 45 };
const reference = [
  { speaker: 'B', annotatedSpeechSeconds: 15 },
  { speaker: 'D', annotatedSpeechSeconds: 20 },
];

function report(threshold, bOutput, dOutput, outputCount = 2, refs = reference) {
  return {
    schemaVersion: 2,
    sourceCommit: 'invented-source',
    sourceTreeClean: true,
    runtimeIdentity: {
      platform: 'win32',
      architecture: 'x64',
      nodeVersion: '22.23.4',
      operatingSystemRelease: 'invented-windows-build',
    },
    sourceAudioSha256: 'a'.repeat(64),
    windowAudioSha256: 'b'.repeat(64),
    referenceAnnotationSha256: 'c'.repeat(64),
    modelSha256: 'd'.repeat(64),
    toolSha256: 'e'.repeat(64),
    whisperToolSha256: 'f'.repeat(64),
    sourceWindow: window,
    sourceAudio: 'ES2004a.Mix-Headset.wav',
    defaultDiarizationThreshold: 1,
    evaluatedDiarizationThreshold: threshold,
    evaluatedShortMergeLine: 0.85,
    referenceSpeakers: refs,
    referenceAttribution: refs.map((ref, index) => ({
      referenceSpeaker: ref.speaker,
      overlapByOutputSpeaker: {
        [index === 0 ? bOutput : dOutput]: index === 0 ? 12 : 15,
      },
    })),
    output: { finalSpeakerCount: outputCount },
    diagnostics: {
      speechModel: 'invented',
      segmentationModel: 'invented',
      embeddingModel: 'invented',
    },
  };
}

describe('paired AMI threshold screening', () => {
  it('detects newly separated sustained reference voices without implying production acceptance', () => {
    const result = evaluatePair(
      report(1, 'speaker-1', 'speaker-1', 1),
      report(0.8, 'speaker-1', 'speaker-2', 2),
    );
    expect(result.baseline.separatedPairs).toBe(0);
    expect(result.candidate.separatedPairs).toBe(1);
    expect(result.regressions).toEqual([]);
    const summary = summarizePairs([result]);
    expect(summary.improvedSeparationWindows).toBe(1);
    expect(summary.screeningOutcome).toBe('INSUFFICIENT_DIVERSE_EVIDENCE');
    expect(summary.productionRecommendation).toContain('NOT ESTABLISHED');
  });

  it('flags a newly split single-speaker control', () => {
    const solo = [{ speaker: 'B', annotatedSpeechSeconds: 15 }];
    const result = evaluatePair(
      report(1, 'speaker-1', 'speaker-1', 1, solo),
      report(0.8, 'speaker-1', 'speaker-1', 2, solo),
    );
    expect(result.regressions).toContain('possible-solo-oversplit');
    expect(summarizePairs([result]).regressionWindows).toBe(1);
  });

  it('flags lost pairwise separation in the candidate', () => {
    const result = evaluatePair(
      report(1, 'speaker-1', 'speaker-2', 2),
      report(0.8, 'speaker-1', 'speaker-1', 1),
    );
    expect(result.regressions).toContain('lost-pair-separation');
  });

  it('rejects incompatible sources, relabel configurations and mismatched commits', () => {
    const a = report(1, 'speaker-1', 'speaker-2');
    const b = report(0.8, 'speaker-1', 'speaker-2');
    expect(() => evaluatePair(a, { ...b, sourceCommit: 'other' })).toThrow(/match/);
    expect(() => evaluatePair(a, { ...b, evaluatedShortMergeLine: 0.6 })).toThrow(/match/);
    expect(() => evaluatePair(a, { ...b, sourceWindow: { ...window, startSeconds: 530 } })).toThrow(
      /paired reports must match/,
    );
  });

  it('rejects dirty source trees and mismatched content hashes', () => {
    const a = report(1, 'speaker-1', 'speaker-2');
    const b = report(0.8, 'speaker-1', 'speaker-2');
    expect(() => evaluatePair(a, { ...b, sourceTreeClean: false })).toThrow(/match/);
    expect(() => evaluatePair(a, { ...b, windowAudioSha256: '0'.repeat(64) })).toThrow(/hashes/);
    expect(() => evaluatePair(a, { ...b, modelSha256: 'invalid' })).toThrow(/hashes/);
    expect(() => evaluatePair(a, { ...b, toolSha256: '0'.repeat(64) })).toThrow(/hashes/);
    expect(() =>
      evaluatePair(a, { ...b, runtimeIdentity: { ...b.runtimeIdentity, nodeVersion: 'other' } }),
    ).toThrow(/match/);
    expect(() => evaluatePair(a, { ...b, runtimeIdentity: undefined })).toThrow(/match/);
  });

  it.each([3, 4])('warns when two sustained speakers produce %i output speakers', (count) => {
    const result = evaluatePair(
      report(1, 'speaker-1', 'speaker-2', 2),
      report(0.8, 'speaker-1', 'speaker-2', count),
    );
    expect(result.regressions).toContain('possible-multivoice-oversplit');
  });

  it('rejects traversal and duplicate windows before scoring another cohort', () => {
    expect(() => reportFilename({ ...window, meeting: '../ES2004a' }, 0.8)).toThrow(/plain AMI/);
    expect(() => reportFilename({ ...window, durationSeconds: 61 }, 0.8)).toThrow(/duration/);
    expect(reportFilename(window, 0.8)).toBe('ES2004a-529-45-t08.json');
    const result = evaluatePair(
      report(1, 'speaker-1', 'speaker-2'),
      report(0.8, 'speaker-1', 'speaker-2'),
    );
    expect(() => summarizePairs([result, result])).toThrow(/duplicate/);
  });
});
