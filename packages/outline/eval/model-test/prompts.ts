import { createHash } from 'node:crypto';
import { DECODING } from './backend.js';
import type { PartialNotes } from './partial.js';
import type { RefTopic } from './taskA.js';

/** Frozen prompts and chunking (plan section 7). Changing any of this changes the manifest hash. */
export const CHUNK_WORDS = 3000;

export const SYSTEM =
  'You write meeting notes from a transcript. Use only what the transcript says. Reply with one JSON object and nothing else.';

const CITE =
  'Cite the transcript lines each point comes from as "L12" or "L12-L14". A point has one fact, at most 40 words.';

export function promptA(outline: readonly string[], transcript: string): string {
  return [
    'Outline topics:',
    ...outline.map((t, i) => `${i + 1}. ${t}`),
    '',
    'For each outline topic, list the points the transcript supports. If the transcript never covers a topic, give it no points.',
    'If the meeting clearly raised a topic that the outline lacks, add it as a new topic with its points.',
    CITE,
    'Reply as {"topics":[{"title":"...","points":[{"text":"...","cite":"L1-L2"}]}]}.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}

export function promptB(outline: readonly string[], partial: string, transcript: string): string {
  return [
    'Outline topics:',
    ...outline.map((t, i) => `${i + 1}. ${t}`),
    '',
    'Partial notes (each point has an id):',
    partial,
    '',
    'Compare the notes with the transcript. Propose additions for points the transcript supports that the notes miss.',
    'Propose a move only for a point filed under the wrong topic; leave correct points alone. Do not reword or delete points unless they are wrong.',
    CITE,
    'Reply as {"additions":[{"topic":"...","text":"...","cite":"L1-L2"}],"moves":[{"id":"p3","toTopic":"..."}],"edits":[{"id":"p5","kind":"reword"}]}.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}

export function renderPartial(topics: readonly RefTopic[], p: PartialNotes): string {
  return topics
    .map((t, ti) =>
      [
        `## ${t.title}`,
        ...p.points.filter((x) => x.topic === ti).map((x) => `- [${x.id}] ${x.text}`),
      ].join('\n'),
    )
    .join('\n');
}

/** Hash of everything frozen about the prompts and decoding; goes in the manifest. */
export function promptHash(): string {
  const src = [
    SYSTEM,
    promptA(['O'], 'T'),
    promptB(['O'], 'P', 'T'),
    String(CHUNK_WORDS),
    JSON.stringify(DECODING),
  ].join('\u0000');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}
