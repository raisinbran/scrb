import { describe, expect, it } from 'vitest';
import { assemble, decideSpeakers } from '../src/finalPass.js';
import { assignSpeakers } from '../src/speakers.js';
import type { RawSegment } from '../src/sherpa.js';

const twoVoices: RawSegment[] = [
  { start: 0, end: 60, speaker: 0 },
  { start: 60, end: 80, speaker: 1 },
];

function decide(raw: RawSegment[]): ReturnType<typeof decideSpeakers> {
  return decideSpeakers(
    raw,
    raw.map((segment) => ({
      segment,
      vector: segment.speaker === 0 ? [1, 0] : [0, 1],
    })),
  );
}

const word = (startMs: number, endMs: number) => ({
  text: 'word',
  startMs,
  endMs,
  confidence: 1,
});

function finalMeeting(
  decision: ReturnType<typeof decideSpeakers>,
  words: ReturnType<typeof word>[],
) {
  return assemble(
    [{ kind: 'meeting', wavPath: 'synthetic.wav', words }],
    decision.spans,
    decision.speakers,
  );
}

describe('final speaker attribution boundaries (synthetic data only)', () => {
  it('keeps two adjacent, correctly diarized remote voices separate through assembly', () => {
    const decision = decide(twoVoices);
    expect(decision.spans).toEqual([
      { startMs: 0, endMs: 60_000, speakerId: 'speaker-1' },
      { startMs: 60_000, endMs: 80_000, speakerId: 'speaker-2' },
    ]);

    const transcript = finalMeeting(decision, [word(59_600, 59_900), word(60_200, 60_500)]);
    expect(transcript.words.map((w) => w.speakerId)).toEqual(['speaker-1', 'speaker-2']);
    expect(transcript.turns.map((turn) => turn.speakerId)).toEqual(['speaker-1', 'speaker-2']);
  });

  it('attributes a second voice to the earlier speaker when its diarization span is missing', () => {
    const decision = decide([twoVoices[0]!]);
    const secondVoiceWord = word(60_400, 60_700);

    expect(decision.speakers).toHaveLength(1);
    expect(assignSpeakers([secondVoiceWord], decision.spans, 'unknown')).toEqual(['speaker-1']);
    expect(finalMeeting(decision, [secondVoiceWord]).words.map((w) => w.speakerId)).toEqual([
      'speaker-1',
    ]);
  });

  it('distinguishes nearest-span selection at 30 s from the production fallback beyond it', () => {
    const decision = decide([twoVoices[0]!]);
    const atLimit = word(90_000, 90_300);
    const beyondLimit = word(90_001, 90_301);

    expect(assignSpeakers([atLimit], decision.spans, 'unknown')).toEqual(['speaker-1']);
    expect(assignSpeakers([beyondLimit], decision.spans, 'unknown')).toEqual(['unknown']);
    // assemble uses speaker-1 as its fallback even when no diarization span is eligible.
    expect(finalMeeting(decision, [beyondLimit]).words.map((w) => w.speakerId)).toEqual([
      'speaker-1',
    ]);
  });

  it('chooses the earlier span when equal overlap hides the actual second voice', () => {
    const decision = decide([
      { start: 0, end: 40, speaker: 0 },
      { start: 20, end: 60, speaker: 1 },
    ]);
    const actualSpeakerId = 'speaker-2';
    const transcript = finalMeeting(decision, [word(30_000, 31_000)]);

    expect(decision.spans.map((s) => s.speakerId)).toEqual(['speaker-1', 'speaker-2']);
    expect(transcript.words[0]!.speakerId).toBe('speaker-1');
    expect(transcript.words[0]!.speakerId).not.toBe(actualSpeakerId);
    expect(finalMeeting(decision, [word(40_200, 40_500)]).words[0]!.speakerId).toBe('speaker-2');
  });

  it('uses input order for identical-time span ties, not an inferred speaker identity', () => {
    const tied = [
      { startMs: 20_000, endMs: 40_000, speakerId: 'a' },
      { startMs: 20_000, endMs: 40_000, speakerId: 'b' },
    ];
    const spoken = word(30_000, 30_300);

    expect(assignSpeakers([spoken], tied, 'unknown')).toEqual(['a']);
    expect(assignSpeakers([spoken], [...tied].reverse(), 'unknown')).toEqual(['b']);
  });

  it('shows how a shifted word timestamp crosses an otherwise correct speaker boundary', () => {
    const decision = decide(twoVoices);
    const correctlyTimed = word(60_100, 60_400);
    const shiftedEarlier = word(59_700, 60_000);

    expect(finalMeeting(decision, [correctlyTimed]).words.map((w) => w.speakerId)).toEqual([
      'speaker-2',
    ]);
    expect(finalMeeting(decision, [shiftedEarlier]).words.map((w) => w.speakerId)).toEqual([
      'speaker-1',
    ]);
    expect(decision.spans[1]!.speakerId).toBe('speaker-2');
  });
});
