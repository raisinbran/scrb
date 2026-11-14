import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pcmToWav } from '../src/audio.js';
import { envelopeOf, readWavEnvelope, similarWord } from '../src/echoEnvelope.js';
import { assemble, dropRoomEcho } from '../src/finalPass.js';

// All data is invented: loudness patterns come from a seeded generator, words from a fixed list.
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const VOCAB = [
  'budget',
  'review',
  'friday',
  'launch',
  'team',
  'design',
  'market',
  'plan',
  'client',
  'data',
];
const WORD_STEP_MS = 400;
const WORD_MS = 280;
const DELAY_MS = 140;
const SECONDS = 60;

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

const word = (text: string, startMs: number): Word => ({ text, startMs, endMs: startMs + WORD_MS });

/** Speech-like loudness (dB per 10 ms): a burst per word over a quiet floor. */
function speechEnv(words: Word[], seed: number, peakDb: number): Float32Array {
  const r = rng(seed);
  const env = new Float32Array(SECONDS * 100).fill(-62);
  for (const w of words) {
    for (let f = Math.round(w.startMs / 10); f < Math.round(w.endMs / 10) && f < env.length; f++) {
      env[f] = peakDb - r() * 14;
    }
  }
  return env;
}

const sumDb = (a: number, b: number): number => 10 * Math.log10(10 ** (a / 10) + 10 ** (b / 10));

/** The mic loudness: the meeting delayed and 12 dB down, plus the user's own speech if any. */
function micEnv(meeting: Float32Array, user?: Float32Array): Float32Array {
  const lag = DELAY_MS / 10;
  const r = rng(7);
  return meeting.map((_, i) => {
    const echo = (i >= lag ? meeting[i - lag]! : -62) - 12 + (r() - 0.5);
    return user ? sumDb(echo, user[i]!) : echo;
  });
}

const meetingWords: Word[] = Array.from({ length: 120 }, (_, i) =>
  word(VOCAB[(i * 7 + (i >> 2)) % VOCAB.length]!, 1000 + i * WORD_STEP_MS),
);
const meetingEnv = speechEnv(meetingWords, 11, -28);
const shifted = (w: Word, text = w.text): Word => word(text, w.startMs + DELAY_MS);

describe('similarWord', () => {
  it('accepts a near spelling of a longer word and nothing short', () => {
    expect(similarWord('agreement', 'agreements')).toBe(true);
    expect(similarWord('budget', 'budgets')).toBe(true);
    expect(similarWord('review', 'preview')).toBe(true);
    expect(similarWord('cat', 'cut')).toBe(false);
    expect(similarWord('plan', 'plane')).toBe(true);
    expect(similarWord('team', 'tell')).toBe(false);
    expect(similarWord('launch', 'market')).toBe(false);
  });
});

describe('fuzzy text echo', () => {
  const meeting = [word('the', 0), word('budgets', 300), word('review', 700), word('friday', 1100)];

  it('drops a run that has one exact word and a near spelling', () => {
    const mic = [shifted(meeting[1]!, 'budget'), shifted(meeting[2]!), shifted(meeting[3]!)];
    expect(dropRoomEcho(mic, meeting)).toHaveLength(0);
  });

  it('does not drop a run made only of near spellings without audio', () => {
    const mic = [shifted(meeting[1]!, 'budget'), shifted(meeting[2]!, 'reviews')];
    expect(dropRoomEcho(mic, meeting)).toHaveLength(2);
  });

  it('keeps short words that merely look alike', () => {
    const m = [word('cat', 0), word('sat', 300)];
    const mic = [word('cut', 100), word('set', 400)];
    expect(dropRoomEcho(mic, m)).toHaveLength(2);
  });
});

describe('loudness echo', () => {
  const echoMic = (text: (i: number) => string): Word[] =>
    meetingWords.map((w, i) => shifted(w, text(i)));

  it('drops echo whose words were heard differently when its loudness follows the meeting', () => {
    // Every third word is heard as something else, so the text rule alone leaves those behind.
    const mic = echoMic((i) => (i % 3 === 2 ? 'something' : meetingWords[i]!.text));
    const audio = { mic: micEnv(meetingEnv), meeting: meetingEnv };
    expect(dropRoomEcho(mic, meetingWords).length).toBeGreaterThan(10);
    expect(dropRoomEcho(mic, meetingWords, audio)).toHaveLength(0);
  });

  it('keeps the user speaking over the meeting, even louder than the echo', () => {
    const userWords = Array.from({ length: 12 }, (_, i) =>
      word(`mine${i}`, 20_000 + i * WORD_STEP_MS),
    );
    const userEnv = speechEnv(userWords, 99, -22);
    const echoOnly = meetingWords.filter((w) => w.startMs < 19_000 || w.startMs > 26_000);
    const audio = { mic: micEnv(meetingEnv, userEnv), meeting: meetingEnv };
    // The meeting talks throughout the user's window, so these words overlap meeting audio.
    expect(meetingWords.some((w) => w.startMs > 20_000 && w.startMs < 24_000)).toBe(true);
    const kept = dropRoomEcho(
      [...echoOnly.map((w) => shifted(w, w.text)), ...userWords],
      meetingWords,
      audio,
    );
    expect(kept.map((w) => w.text)).toEqual(userWords.map((w) => w.text));
  });

  it('keeps user words that follow the meeting pattern but are much louder than the echo', () => {
    // The same loudness shape as the meeting, 20 dB above the echo: not the room's gain.
    const userWords = meetingWords
      .slice(40, 48)
      .map((w) => word(`mine${w.startMs}`, w.startMs + 20));
    const userEnv = speechEnv(userWords, 5, -20);
    const mic = [
      ...meetingWords.filter((_, i) => i < 38 || i > 50).map((w) => shifted(w)),
      ...userWords,
    ];
    const audio = { mic: micEnv(meetingEnv, userEnv), meeting: meetingEnv };
    expect(dropRoomEcho(mic, meetingWords, audio).map((w) => w.text)).toEqual(
      userWords.map((w) => w.text),
    );
  });

  it('does nothing when the mic does not follow the meeting (headset, no echo)', () => {
    const own = Array.from({ length: 120 }, (_, i) =>
      word(`own${i % 5}`, 1000 + i * WORD_STEP_MS + 90),
    );
    const audio = { mic: speechEnv(own, 3, -26), meeting: meetingEnv };
    expect(dropRoomEcho(own, meetingWords, audio)).toHaveLength(120);
  });

  it('needs several loudness-only words in a row when no text echo is beside them', () => {
    // A few echo-shaped words alone in a quiet mic: the run is too short to trust.
    const known = meetingWords.slice(0, 60).map((w) => shifted(w));
    const odd = [shifted(meetingWords[80]!, 'zzzz'), shifted(meetingWords[81]!, 'yyyy')];
    const audio = { mic: micEnv(meetingEnv), meeting: meetingEnv };
    expect(dropRoomEcho([...known, ...odd], meetingWords, audio).map((w) => w.text)).toEqual([
      'zzzz',
      'yyyy',
    ]);
  });
});

describe('assemble with audio', () => {
  it('uses the envelopes passed in', () => {
    const say = (text: string, startMs: number) => ({
      text,
      startMs,
      endMs: startMs + WORD_MS,
      confidence: 1,
    });
    const mic = meetingWords.map((w, i) => say(i % 3 === 2 ? 'hmm' : w.text, w.startMs + DELAY_MS));
    const meeting = meetingWords.map((w) => say(w.text, w.startMs));
    const tracks = (): Parameters<typeof assemble>[0] => [
      { kind: 'meeting', wavPath: 'm.wav', words: meeting },
      { kind: 'mic', wavPath: 'y.wav', words: mic.map((w) => ({ ...w })) },
    ];
    const spans = [{ startMs: 0, endMs: 60_000, speakerId: 'speaker-1' }];
    const speakers = [
      { id: 'speaker-1', label: 'Speaker 1', speechMs: 1000, embeddingSegments: 0 },
    ];
    const without = assemble(tracks(), spans, speakers);
    const withAudio = assemble(tracks(), spans, speakers, {
      mic: micEnv(meetingEnv),
      meeting: meetingEnv,
    });
    expect(without.words.filter((w) => w.track === 'mic').length).toBeGreaterThan(10);
    expect(withAudio.words.filter((w) => w.track === 'mic')).toHaveLength(0);
  });
});

describe('envelope of audio', () => {
  it('reads a final-pass WAV and rejects other layouts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'env-'));
    try {
      const pcm = new Int16Array(16_000);
      for (let i = 0; i < pcm.length; i++) pcm[i] = i < 8000 ? 0 : 8192;
      const good = join(dir, 'a.wav');
      await writeFile(good, pcmToWav(pcm));
      const env = (await readWavEnvelope(good))!;
      expect(env).toHaveLength(100);
      expect(env[10]).toBeLessThan(-60);
      expect(env[90]).toBeCloseTo(-12, 0);
      expect(Array.from(env)).toEqual(Array.from(envelopeOf(pcm)));
      const bad = join(dir, 'b.wav');
      await writeFile(bad, Buffer.from('not a wav file at all, not even close to one....'));
      expect(await readWavEnvelope(bad)).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
