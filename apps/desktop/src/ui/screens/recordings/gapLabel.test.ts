import { describe, expect, it } from 'vitest';
import type { TimelineGap } from '@scrb/contracts';
import { gapLabel } from './TranscriptTab.tsx';

const gap = (
  kind: TimelineGap['kind'],
  track: TimelineGap['track'],
  startMs: number,
  endMs: number,
): TimelineGap => ({ kind, track, startMs, endMs });

describe('gapLabel', () => {
  it('names the microphone and rounds the range outward', () => {
    expect(gapLabel(gap('audioMissing', 'microphone', 683_800, 709_000))).toBe(
      'Microphone audio missing, 11:23 to 11:49',
    );
  });

  it('names the meeting audio', () => {
    expect(gapLabel(gap('audioMissing', 'meeting', 10_000, 20_000))).toBe(
      'Meeting audio missing, 00:10 to 00:20',
    );
  });

  it('is calm about a low-confidence gap', () => {
    expect(gapLabel(gap('possiblyMissing', 'meeting', 10_000, 20_000))).toBe(
      'Meeting audio may be missing, 00:10 to 00:20',
    );
  });

  it('never shows a zero-length range', () => {
    expect(gapLabel(gap('possiblyMissing', 'meeting', 150_106, 150_138))).toBe(
      'Meeting audio may be missing, 02:30 to 02:31',
    );
    expect(gapLabel(gap('audioMissing', 'meeting', 150_000, 150_000))).toBe(
      'Meeting audio missing, at 02:30',
    );
  });

  it('keeps pauses and sleep', () => {
    expect(gapLabel(gap('paused', 'both', 5_000, 9_000))).toBe('Paused, 00:05 to 00:09');
    expect(gapLabel(gap('computerAsleep', 'both', 5_000, 9_000))).toBe(
      'Computer asleep, 00:05 to 00:09',
    );
  });
});
