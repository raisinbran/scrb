import { createHash } from 'node:crypto';
import { DECODING } from './backend.js';
import type { PartialNotes } from './partial.js';
import type { RefTopic } from './taskA.js';
import type { OutlineItem } from '../../src/types.js';

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

export function promptAgenda(items: readonly OutlineItem[], transcript: string): string {
  return [
    'Agenda topics (use the id exactly):',
    ...items.map((t) => `${'  '.repeat(t.level - 1)}${t.id}: ${t.text}`),
    '',
    'List EVERY decision, date or deadline, caveat or risk, action and open question the transcript contains for each topic, plus significant information. Skip small talk.',
    'Kinds: decision (the group agreed, chose, settled or decided something, including a decision NOT to do something; a changed value is a decision), date (any date, weekday, deadline or amount of time), caveat (a risk, condition or doubt), action (a task someone takes on: put their name in the text, like "Sam to send the report by Friday"), question (asked and not answered), info (anything else significant).',
    'Keep tentative, conditional and disputed statements as such. If a value changed later, state only the final one and cite both places.',
    'Use the topic id exactly; for a topic the agenda lacks, set "topic":"new" and "newTopic":"title".',
    'Cite exactly ONE contiguous range, "L12" or "L12-L14", at most 6 lines, copied from the [L..] markers. Never a comma-separated list and never a line that is not in the transcript. A fact has one claim, at most 40 words.',
    'Do not output an owner field. Write one claim per fact and do not combine several numbers or dates in one fact; split them into separate facts.',
    'Reply as {"facts":[{"topic":"o1","kind":"decision","text":"...","cite":"L1-L2"}]}.',
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

export const AGENDA_SYSTEM =
  'You write meeting notes from a transcript. Reply with one JSON object only.';

/** Hash of the agenda-aware prompt, system text, chunking and decoding; goes in the manifest beside promptHash. */
export function agendaPromptHash(): string {
  const item = { id: 'o1', level: 1, text: 'O' } as OutlineItem;
  const src = [
    AGENDA_SYSTEM,
    promptAgenda([item], 'T'),
    String(CHUNK_WORDS),
    JSON.stringify(DECODING),
  ].join('\u0000');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
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

export const CANDIDATE_SYSTEM =
  'You find statements worth recording in a meeting transcript. Reply with one JSON object only.';

/** Pass 1: line spans only, no kind and no topic. */
export function promptCandidates(transcript: string): string {
  return [
    'List every place in the transcript where someone states a decision or agreement, a commitment or action item, a date or deadline, a number or amount, or an open question.',
    'Skip greetings, small talk, filler, and remarks about the meeting itself (audio, screen sharing, timing, thanks). Do not list a line only because it follows or precedes a relevant one.',
    'Each span is 1 to 3 consecutive lines. Give the line numbers as "L12" or "L12-L14", copied from the [L..] markers, and "quote": the first 4 to 8 words of the span, copied exactly.',
    'Reply as {"spans":[{"lines":"L12","quote":"..."}]}.',
    '',
    'Transcript:',
    transcript,
  ].join('\n');
}

export const CLASSIFY_SYSTEM =
  'You turn candidate meeting statements into notes. Reply with one JSON object only.';

/** Pass 2: classify each candidate, assign an agenda topic, rewrite as one claim. */
export function promptClassify(
  items: readonly OutlineItem[],
  candidates: readonly { label: string; text: string }[],
): string {
  return [
    'Agenda topics (use the id exactly):',
    ...items.map((t) => `${'  '.repeat(t.level - 1)}${t.id}: ${t.text}`),
    '',
    'Candidate statements, each labelled with its line numbers:',
    ...candidates.map((c) => `${c.label}: ${c.text}`),
    '',
    'Answer EVERY candidate, one entry each. For each, give its label exactly as shown ("span"), its agenda topic id (or "new" with "newTopic":"title" for a topic the agenda lacks), a kind, and one claim of at most 40 words using only that candidate\'s own words; keep every number, date and name exactly as said.',
    'Kinds: decision (agreed, chosen, settled or decided, including a decision NOT to do something; a changed value is a decision), action (a task someone takes on: put their name in the claim), date (a date, weekday, deadline or amount of time), number (a figure or amount that is not a decision), caveat (a risk, condition or doubt), question (asked and not answered), other (not worth recording).',
    'Reply as {"facts":[{"span":"L12","topic":"o1","kind":"decision","text":"..."}]}.',
  ].join('\n');
}

export function twoPassPromptHash(): string {
  const item = { id: 'o1', level: 1, text: 'O' } as OutlineItem;
  const src = [
    CANDIDATE_SYSTEM,
    promptCandidates('T'),
    CLASSIFY_SYSTEM,
    promptClassify([item], [{ label: 'L1', text: 'T' }]),
    String(CHUNK_WORDS),
    JSON.stringify(DECODING),
  ].join('\u0000');
  return createHash('sha256').update(src).digest('hex').slice(0, 16);
}
