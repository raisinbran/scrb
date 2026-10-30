import { resolveDisplay, type DisplayToken } from './corrections.ts';
import type { TranscriptFile } from './formats/transcript.ts';

const SNIPPET_TOKENS = 8;

/** Case, accents and punctuation do not affect a match. */
export function foldText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface TranscriptHit {
  startMs: number;
  speakerId: string;
  snippet: string;
}

interface IndexedToken {
  token: DisplayToken;
  speakerId: string;
  offset: number;
}

/** Finds a phrase in the transcript as displayed, across speaker and segment boundaries. */
export function searchTranscript(
  transcript: TranscriptFile,
  query: string,
  limit: number,
): { hits: TranscriptHit[]; total: number } {
  const needle = foldText(query);
  if (needle === '') return { hits: [], total: 0 };

  const tokens: IndexedToken[] = [];
  const parts: string[] = [];
  let offset = 0;
  for (const segment of resolveDisplay(transcript)) {
    for (const token of segment.tokens) {
      const folded = foldText(token.text);
      if (folded === '') continue;
      tokens.push({ token, speakerId: segment.speakerId, offset });
      parts.push(folded);
      offset += folded.length + 1;
    }
  }
  const haystack = parts.join(' ');

  const hits: TranscriptHit[] = [];
  let total = 0;
  let from = 0;
  let cursor = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;
    total += 1;
    from = at + needle.length;
    if (hits.length >= limit) continue;
    while (cursor + 1 < tokens.length && (tokens[cursor + 1] as IndexedToken).offset <= at) {
      cursor += 1;
    }
    const hit = tokens[cursor] as IndexedToken;
    const around = tokens.slice(Math.max(0, cursor - SNIPPET_TOKENS), cursor + SNIPPET_TOKENS + 1);
    hits.push({
      startMs: hit.token.startMs,
      speakerId: hit.speakerId,
      snippet: around.map((item) => item.token.text).join(' '),
    });
  }
  return { hits, total };
}
