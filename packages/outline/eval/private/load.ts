import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { contentTokens } from '@scrb/summary';
import { parseOutline } from '../../src/parse.js';
import type { OutlineItem, TranscriptWord } from '../../src/types.js';

/**
 * Loader for the owner's private meetings. Folder layout, one sub-folder per meeting:
 *   outline.md, transcript.txt, final-notes.md (a recording may sit beside them; it is never opened).
 * Nothing here logs or returns file text except to the caller that scores it.
 */

const GAP_MS = 2500;
const WORD_MS = 400;
const TIME = /^\[?(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\]?\s*/;
const SPEAKER = /^([^:\n]{1,30}):\s+/;

/** One word per whitespace-separated token. Lines may start with a time and/or "Name:". */
export function parseTranscript(text: string): TranscriptWord[] {
  const lines = text
    .split(/\r?\n/)
    .map((raw) => {
      let rest = raw.trim();
      let ts: number | null = null;
      const t = TIME.exec(rest);
      if (t) {
        const [a, b, c] = [Number(t[1]), Number(t[2]), t[3] === undefined ? null : Number(t[3])];
        ts = (c === null ? a * 60 + b : (a * 60 + b) * 60 + c) * 1000;
        rest = rest.slice(t[0].length);
      }
      let speaker = 'S';
      const s = SPEAKER.exec(rest);
      if (s) {
        speaker = s[1]!.trim();
        rest = rest.slice(s[0].length);
      }
      return { ts, speaker, tokens: rest.split(/\s+/).filter(Boolean) };
    })
    .filter((l) => l.tokens.length > 0);
  const words: TranscriptWord[] = [];
  let cursor = 0;
  lines.forEach((line, li) => {
    const start =
      line.ts === null ? (words.length ? cursor + GAP_MS : 0) : Math.max(line.ts, cursor);
    const next = lines.slice(li + 1).find((l) => l.ts !== null)?.ts ?? null;
    const span = next !== null && next > start ? (next - start) / line.tokens.length : WORD_MS;
    const per = Math.max(50, Math.min(WORD_MS, span));
    line.tokens.forEach((tok, i) => {
      words.push({
        id: `w${words.length}`,
        text: tok,
        speaker: line.speaker,
        startMs: Math.round(start + i * per),
        endMs: Math.round(start + i * per + per * 0.95),
      });
    });
    cursor = Math.round(start + line.tokens.length * per);
  });
  return words;
}

/** A markdown heading or a line that is only bold: a section start, whether or not the outline has it. */
const SECTION_HEADING = /^\s*(?:#{1,6}\s|(?:\*\*|__).+(?:\*\*|__)\s*:?\s*$)/;
const BULLET = /^\s*[-*•+]\s+/;

function headingCandidate(raw: string): string | null {
  if (BULLET.test(raw)) return null;
  const t = raw
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^\d+(?:\.\d+)*[.)]?\s+/, '')
    .replace(/^\(?[A-Za-z][.)]\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/:\s*$/, '')
    .trim();
  return t.length > 0 ? t : null;
}

function matchScore(item: OutlineItem, line: string): number {
  const a = contentTokens(item.text);
  const b = contentTokens(line);
  if (a.size === 0 || b.size === 0) {
    return item.text.trim().toLowerCase() === line.trim().toLowerCase() ? 1 : 0;
  }
  if (line.split(/\s+/).length > item.text.split(/\s+/).length + 4) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit += 1;
  const jaccard = hit / (a.size + b.size - hit);
  return hit === a.size ? Math.max(jaccard, 0.8) : jaccard >= 0.75 ? jaccard : 0;
}

/**
 * Splits final notes into one body per outline item. A line starts a section when it is not a bullet,
 * is about as short as an outline item, and its content words match that item's (all of them, or
 * Jaccard 0.75). Each item is used once; the next unmatched item in outline order wins ties.
 * A markdown heading or all-bold line that matches no item ends the current section, so its text is
 * never filed under the section above. Returns bodies indexed like `items`; an item with no heading found is null.
 */
export function splitNotes(notes: string, items: readonly OutlineItem[]): (string | null)[] {
  const bodies: (string[] | null)[] = items.map(() => null);
  let current = -1;
  let last = -1;
  for (const raw of notes.split(/\r?\n/)) {
    const cand = headingCandidate(raw);
    let best = -1;
    let bestScore = 0;
    if (cand) {
      items.forEach((item, i) => {
        if (bodies[i] !== null) return;
        const base = matchScore(item, cand);
        const s = base > 0 && i > last ? base + 0.001 : base;
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      });
    }
    if (best >= 0) {
      bodies[best] = [];
      current = best;
      last = best;
    } else if (SECTION_HEADING.test(raw)) current = -1;
    else if (current >= 0 && raw.trim()) bodies[current]!.push(raw.replace(BULLET, '').trim());
  }
  return bodies.map((b) => (b === null ? null : b.join('\n')));
}

export type SkipCode =
  'noOutline' | 'noTranscript' | 'noNotes' | 'outlineRejected' | 'emptyTranscript';

export interface PrivateMeeting {
  items: OutlineItem[];
  words: TranscriptWord[];
  /** Notes body per outline item; null when the notes have no matching heading. */
  bodies: (string | null)[];
}

export type Loaded = { ok: true; meeting: PrivateMeeting } | { ok: false; code: SkipCode };

/** Sub-folders in name order; names starting with "_" or "." are skipped. Names are never reported. */
export function listPrivateMeetings(root: string): string[] {
  return readdirSync(root)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter((n) => statSync(join(root, n)).isDirectory())
    .sort();
}

export function loadPrivateMeeting(folder: string): Loaded {
  const file = (n: string): string => join(folder, n);
  const need: [string, SkipCode][] = [
    ['outline.md', 'noOutline'],
    ['transcript.txt', 'noTranscript'],
    ['final-notes.md', 'noNotes'],
  ];
  for (const [n, code] of need) if (!existsSync(file(n))) return { ok: false, code };
  const parsed = parseOutline(readFileSync(file('outline.md'), 'utf8'));
  if (parsed.error || parsed.items.length === 0) return { ok: false, code: 'outlineRejected' };
  const words = parseTranscript(readFileSync(file('transcript.txt'), 'utf8'));
  if (words.length === 0) return { ok: false, code: 'emptyTranscript' };
  const bodies = splitNotes(readFileSync(file('final-notes.md'), 'utf8'), parsed.items);
  return { ok: true, meeting: { items: parsed.items, words, bodies } };
}
