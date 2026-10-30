import type {
  MeetingId,
  Speaker,
  TranscriptSegment,
  TranscriptWord,
  WordState,
} from '@scrb/contracts';
import { createPrng } from './prng.ts';

// Invented meeting talk about an invented project. Never real meeting content.
const LINES = [
  'okay so the first thing on my list is the pilot rollout for the northern depot',
  'I spoke with the vendor yesterday and they can move the delivery to the second week',
  'that works for us as long as the integration testing finishes before then',
  'can we get an updated estimate on the storage costs before Friday',
  'I think the main risk is still the migration of the older inventory records',
  'we should probably keep the manual process running in parallel for a month',
  'let me take that one and come back with numbers at the next sync',
  'the dashboard is mostly done but the export button still needs some work',
  'does anyone object to moving the review to Thursday morning',
  'I would rather decide on the budget once we have seen the second quote',
  'right so the action there is for me to check with finance',
  'we had three support tickets about the login screen last week',
  'the fix went out on Tuesday and nothing has come back since then',
  'if we cut the reporting module we could still make the original date',
  'I am not sure that is the right call but I can see the argument',
  'let us park that for now and return to it when we have more data',
  'the training material is ready and the first session is booked',
  'one open question is who owns the on call rota after launch',
  'sounds good I will send a short note to the team this afternoon',
  'before we finish is there anything else anyone wants to raise',
] as const;

export const MOCK_SPEAKERS: Speaker[] = [
  { id: 'sp-you', label: 'You', kind: 'you', profileId: null },
  { id: 'sp-2', label: 'Priya Natarajan', kind: 'named', profileId: 'profile-1' },
  { id: 'sp-3', label: 'Speaker 2', kind: 'unknown', profileId: null },
  { id: 'sp-4', label: 'Speaker 3', kind: 'unknown', profileId: null },
];

const MS_PER_WORD = 345;

export interface SegmentOptions {
  meetingId: MeetingId;
  index: number;
  startMs: number;
  state: WordState;
  prng: ReturnType<typeof createPrng>;
  speakers?: Speaker[];
}

export function generateSegment(options: SegmentOptions): TranscriptSegment {
  const { meetingId, index, startMs, state, prng, speakers = MOCK_SPEAKERS } = options;
  const speaker = prng.pick(speakers);
  const texts = [prng.pick(LINES), ...(prng.next() < 0.5 ? [prng.pick(LINES)] : [])];
  const segmentId = `${meetingId}-seg-${index}`;
  const words: TranscriptWord[] = texts
    .join(' ')
    .split(' ')
    .map((text, wordIndex) => ({
      id: `${segmentId}-w-${wordIndex}`,
      text,
      startMs: startMs + wordIndex * MS_PER_WORD,
      endMs: startMs + (wordIndex + 1) * MS_PER_WORD,
      state,
      correctionId: null,
    }));
  return {
    id: segmentId,
    speakerId: speaker.id,
    track: speaker.kind === 'you' ? 'microphone' : 'meeting',
    startMs,
    endMs: startMs + words.length * MS_PER_WORD,
    words,
  };
}

/** Sets every word's state, leaving a few words corrected so all three styles can be seen. */
export function withWordStates(
  segments: TranscriptSegment[],
  state: WordState,
): TranscriptSegment[] {
  return segments.map((segment, index) => ({
    ...segment,
    words: segment.words.map((word, wordIndex) =>
      index % 7 === 3 && wordIndex === 2
        ? { ...word, state: 'corrected', correctionId: `correction-${index}` }
        : { ...word, state },
    ),
  }));
}

/** Builds a finished transcript of at least `targetWords` words. */
export function generateTranscript(meetingId: MeetingId, targetWords: number, seed: number) {
  const prng = createPrng(seed);
  const segments: TranscriptSegment[] = [];
  let startMs = 0;
  let totalWords = 0;
  while (totalWords < targetWords) {
    const segment = generateSegment({
      meetingId,
      index: segments.length,
      startMs,
      state: 'final',
      prng,
    });
    segments.push(segment);
    totalWords += segment.words.length;
    startMs = segment.endMs + 200;
  }
  return { segments, totalWords, durationMs: startMs };
}
