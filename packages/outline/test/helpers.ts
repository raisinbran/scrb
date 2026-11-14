import type { OutlineItem, TranscriptWord } from '../src/types.js';

/** Builds words at 400 ms each; a gap before a line is given in seconds. */
export function say(
  speaker: string,
  text: string,
  startMs: number,
  idPrefix: string,
): { words: TranscriptWord[]; endMs: number } {
  const words = text.split(/\s+/).map((t, i) => ({
    id: `${idPrefix}${i}`,
    text: t,
    speaker,
    startMs: startMs + i * 400,
    endMs: startMs + i * 400 + 380,
  }));
  return { words, endMs: startMs + words.length * 400 };
}

export function transcript(
  lines: [speaker: string, text: string, gapSec?: number][],
): TranscriptWord[] {
  const out: TranscriptWord[] = [];
  let t = 0;
  lines.forEach(([speaker, text, gap], i) => {
    t += (gap ?? 3) * 1000;
    const r = say(speaker, text, t, `l${i}w`);
    out.push(...r.words);
    t = r.endMs;
  });
  return out;
}

export const OUTLINE: OutlineItem[] = [
  { id: 'o1', level: 1, text: 'Budget' },
  { id: 'o2', level: 1, text: 'Hiring plan' },
  { id: 'o3', level: 1, text: 'Product roadmap' },
];

export const BUDGET =
  'we reviewed the budget spending forecast and the budget numbers for this quarter again before approving anything';
export const HIRING =
  'the hiring plan needs two engineers and a recruiter so hiring starts next month with interviews booked already';
export const ROADMAP =
  'the product roadmap puts the mobile release first and the roadmap shifts search later because customers asked';
