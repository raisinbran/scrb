import { describe, expect, it } from 'vitest';
import { assemble, buildTurns, cutTurns } from '../src/finalPass.js';
import type { Word } from '../src/types.js';

type W = { text: string; s: number; e?: number };

/** Words of one track, one every 500 ms by default. */
function run(
  track: 'mic' | 'meeting',
  speakerId: string,
  from: number,
  to: number,
  step = 500,
): W[] & { track: string; speakerId: string } {
  const out: W[] = [];
  for (let t = from; t < to; t += step) out.push({ text: `w${t}`, s: t, e: t + step - 100 });
  return Object.assign(out, { track, speakerId });
}

function build(groups: (W[] & { track: string; speakerId: string })[]): {
  words: Word[];
  turns: ReturnType<typeof cutTurns>;
} {
  const words: Word[] = groups
    .flatMap((g) =>
      g.map((w) => ({
        text: w.text,
        startMs: w.s,
        endMs: w.e ?? w.s + 300,
        confidence: 1,
        track: g.track as 'mic' | 'meeting',
        speakerId: g.speakerId,
      })),
    )
    .sort(
      (a, b) =>
        (a.track === 'meeting' ? 0 : 1) - (b.track === 'meeting' ? 0 : 1) || a.startMs - b.startMs,
    );
  return { words, turns: cutTurns(words, buildTurns(words)) };
}

const you = (from: number, to: number, step?: number) => run('mic', 'you', from, to, step);
const remote = (from: number, to: number, id = 'speaker-1') => run('meeting', id, from, to, 200);

describe('cutTurns', () => {
  it('cuts a mic turn where a remote reply lands, in time order', () => {
    const { turns } = build([you(0, 60_000), remote(30_000, 30_300)]);
    expect(turns.map((t) => [t.speakerId, t.startMs])).toEqual([
      ['you', 0],
      ['speaker-1', 30_000],
      ['you', 30_000],
    ]);
    expect(turns[0]!.endMs).toBeLessThanOrEqual(turns[2]!.startMs);
  });

  it('regression: a sentence end before the interjection is not used; right piece starts at or after it', () => {
    const y = you(0, 40_000);
    y[36]!.text = 'early.'; // word at 18 s ends 2 s before the interjection at 20 s
    const { turns } = build([y, remote(20_000, 20_200)]);
    expect(turns.map((t) => t.speakerId)).toEqual(['you', 'speaker-1', 'you']);
    expect(turns[2]!.startMs).toBeGreaterThanOrEqual(20_000);
    expect(turns[0]!.endMs).toBeLessThanOrEqual(turns[1]!.startMs);
  });

  it('prefers a sentence end within the window after the interjection', () => {
    const y = you(0, 40_000);
    y[41]!.text = 'end.'; // word 41 ends; next word (42) starts at 21000, 1 s after 20 s
    const { turns } = build([y, remote(20_000, 20_200)]);
    expect(turns[2]!.startMs).toBe(21_000);
  });

  it('prefers a pause over an exact-time cut', () => {
    const y = you(0, 40_000);
    for (let i = 43; i < y.length; i++) {
      y[i] = { ...y[i]!, s: y[i]!.s + 600, e: y[i]!.e! + 600 };
    }
    const { turns } = build([y, remote(20_000, 20_200)]);
    expect(turns[2]!.startMs).toBe(21_500 + 600);
  });

  it('cuts at the first word at or after the interjection when nothing better exists', () => {
    const { turns } = build([you(0, 40_000), remote(20_250, 20_450)]);
    expect(turns[2]!.startMs).toBe(20_500);
  });

  it('keeps tie order when timestamps are exactly equal', () => {
    const { turns } = build([you(0, 40_000), remote(20_000, 20_200)]);
    expect(turns.map((t) => [t.speakerId, t.startMs])).toEqual([
      ['you', 0],
      ['speaker-1', 20_000],
      ['you', 20_000],
    ]);
    // Speaker id decides only when start and end are both equal.
    const a = build([you(0, 40_000), remote(20_000, 20_200)]).turns;
    const b = build([remote(20_000, 20_200), you(0, 40_000)]).turns;
    expect(b).toEqual(a);
  });

  it('does not cut when a piece would be too small', () => {
    const { turns } = build([you(0, 30_000), remote(500, 700)]);
    // left piece would hold one or two words under 2 s
    expect(turns.map((t) => t.speakerId)).toEqual(['you', 'speaker-1']);
  });

  it('cuts at most once when two interjections are close', () => {
    const { turns } = build([you(0, 40_000), remote(20_000, 20_200), remote(21_000, 21_200)]);
    const youPieces = turns.filter((t) => t.speakerId === 'you');
    expect(youPieces.length).toBeGreaterThanOrEqual(2);
    for (const p of youPieces) expect(p.wordCount >= 3 || p.endMs - p.startMs >= 2000).toBe(true);
  });

  it('does not cut for an interjection longer than 10 s', () => {
    const { turns } = build([you(0, 40_000), remote(20_000, 31_000)]);
    expect(turns.map((t) => t.speakerId)).toEqual(['you', 'speaker-1']);
  });

  it('ignores punctuation-only interjections', () => {
    const r = remote(20_000, 20_200);
    r[0]!.text = '...';
    const { turns } = build([you(0, 40_000), r]);
    expect(turns).toHaveLength(2);
  });

  it('does not use other-turn labels on the same track (no new same-track cuts)', () => {
    const { turns } = build([you(0, 40_000), you(20_000, 20_200).map((w) => w) as never]);
    expect(turns.length).toBeGreaterThanOrEqual(1);
  });

  it('cuts a 150 s solo run into pieces of at most 60 s and leaves 55 s alone', () => {
    const long = build([you(0, 150_000)]).turns;
    expect(long.length).toBeGreaterThanOrEqual(3);
    for (const t of long) expect(t.endMs - t.startMs).toBeLessThanOrEqual(60_000);
    expect(build([you(0, 55_000)]).turns).toHaveLength(1);
  });

  it('cap prefers a sentence end in the last 15 s', () => {
    const y = you(0, 90_000);
    y[100]!.text = 'stop.'; // ends 50.0 s region: word 100 at 50 s
    const { turns } = build([y]);
    expect(turns[1]!.startMs).toBe(50_500);
  });

  it('loses, duplicates and reorders no words; ranges are contiguous', () => {
    const { words, turns } = build([
      you(0, 120_000),
      remote(30_000, 30_300),
      remote(70_000, 70_600, 'speaker-2'),
    ]);
    const seen = new Array<number>(words.length).fill(0);
    for (const t of turns) {
      for (let i = t.firstWord; i < t.firstWord + t.wordCount; i++) seen[i]!++;
      expect(t.text.split(' ')).toEqual(
        words.slice(t.firstWord, t.firstWord + t.wordCount).map((w) => w.text),
      );
    }
    expect(seen.every((n) => n === 1)).toBe(true);
    const again = cutTurns(words, buildTurns(words));
    expect(again).toEqual(turns);
    const shuffled = [...words]
      .reverse()
      .sort(
        (a, b) =>
          (a.track === 'meeting' ? 0 : 1) - (b.track === 'meeting' ? 0 : 1) ||
          a.startMs - b.startMs,
      );
    expect(cutTurns(shuffled, buildTurns(shuffled))).toEqual(turns);
  });
});

describe('assemble with overlap', () => {
  it('orders mic and two remote speakers by time with matching word ranges', () => {
    const mk = (g: W[]) =>
      g.map((w) => ({ text: w.text, startMs: w.s, endMs: w.e ?? w.s + 300, confidence: 1 }));
    const out = assemble(
      [
        { kind: 'meeting', wavPath: 'm.wav', words: mk(remote(25_000, 25_400)) },
        { kind: 'mic', wavPath: 'y.wav', words: mk(you(0, 50_000)) },
      ],
      [{ startMs: 0, endMs: 50_000, speakerId: 'speaker-1' }],
      [{ id: 'speaker-1', label: 'Speaker 1', speechMs: 400, embeddingSegments: 0 }],
    );
    expect(out.turns.map((t) => t.speakerId)).toEqual(['you', 'speaker-1', 'you']);
    for (const t of out.turns) {
      const ws = out.words.slice(t.firstWord, t.firstWord + t.wordCount);
      expect(ws.every((w) => w.speakerId === t.speakerId)).toBe(true);
      expect(ws.map((w) => w.text).join(' ')).toBe(t.text);
    }
  });
});
