import { expect, test } from 'vitest';
import { checkLiveProgress, summarize } from './gate-evidence.mjs';

test('live check rejects an audible stall', () => {
  const result = checkLiveProgress([
    { elapsedSec: 0, meetingWords: 10, speechPresent: true },
    { elapsedSec: 60, meetingWords: 10, speechPresent: true },
    { elapsedSec: 180, meetingWords: 10, speechPresent: true },
  ]);
  expect(result.status).toBe('fail');
  expect(result.maxStallSec).toBe(180);
});

test('live check ignores genuine silence', () => {
  const result = checkLiveProgress([
    { elapsedSec: 0, meetingWords: 10, speechPresent: true },
    { elapsedSec: 120, meetingWords: 10, speechPresent: false },
    { elapsedSec: 240, meetingWords: 11, speechPresent: true },
  ]);
  expect(result.status).toBe('no-stall-detected');
});

test('missing evidence cannot pass', () => {
  const report = summarize(
    { gate: 3, platform: 'macos', id: 'mac-test', sourceCommit: 'a'.repeat(40) },
    null,
    { fileCount: 1, totalBytes: 10, inventorySha256: 'abc', audioManifestPresent: false, transcriptPresent: false },
    0,
  );
  expect(report.status).toBe('INCOMPLETE');
  expect(report.gateApproved).toBe(false);
});

test('public report excludes private fields', () => {
  const report = summarize(
    { gate: 3, platform: 'windows', id: 'win-test', sourceCommit: 'b'.repeat(40) },
    {
      recording: { durationSec: 60, decodedChunks: 5779, decodeFailures: 0, secretMeetingName: 'PRIVATE' },
      live: { wordCount: 100, rawTranscript: 'PRIVATE', samples: [
        { elapsedSec: 0, meetingWords: 1, speechPresent: true, rawText: 'PRIVATE' },
        { elapsedSec: 60, meetingWords: 2, speechPresent: true },
      ] },
      privatePath: 'C:\\PRIVATE',
    },
    { fileCount: 6, totalBytes: 55, inventorySha256: 'abc', audioManifestPresent: true, transcriptPresent: true },
    0,
  );
  expect(report.status).toBe('CHECKS_PASSED');
  expect(JSON.stringify(report).includes('PRIVATE')).toBe(false);
});

test('sparse live samples remain incomplete', () => {
  const report = summarize(
    { gate: 3, platform: 'macos', id: 'sparse-test', sourceCommit: 'c'.repeat(40) },
    {
      recording: { durationSec: 14400, decodedChunks: 100, decodeFailures: 0 },
      live: { samples: [
        { elapsedSec: 0, meetingWords: 1, speechPresent: true },
        { elapsedSec: 14400, meetingWords: 100, speechPresent: true },
      ] },
    },
    { fileCount: 3, totalBytes: 10, inventorySha256: 'abc', audioManifestPresent: true, transcriptPresent: true },
    0,
  );
  expect(report.status).toBe('INCOMPLETE');
});
