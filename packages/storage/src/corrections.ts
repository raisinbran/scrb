import { randomUUID } from 'node:crypto';
import { CorrectionConflictError } from './errors.ts';
import type {
  Correction,
  HistoryEntry,
  Patch,
  Segment,
  Speaker,
  SpeakerOverride,
  Track,
  TranscriptFile,
  Word,
} from './formats/transcript.ts';

/** Context words compared on each side of a frozen run when locating it in new model text. */
const CONTEXT_WORDS = 8;
/** How far from its old time a frozen run may be found in new model text. */
const SEARCH_WINDOW_MS = 20_000;
/** A located region may exceed the frozen run's own length by this much before it is distrusted. */
const REGION_SLACK_MS = 5_000;

interface PlacedWord {
  word: Word;
  segment: Segment;
}

function trackWords(segments: Segment[], track: Track): PlacedWord[] {
  const placed: PlacedWord[] = [];
  for (const segment of segments) {
    if (segment.track !== track) continue;
    for (const word of segment.words) placed.push({ word, segment });
  }
  return placed;
}

function sortSegments(segments: Segment[]): Segment[] {
  const start = (segment: Segment): number => segment.words[0]?.startMs ?? 0;
  return [...segments].sort((a, b) => start(a) - start(b));
}

function isFrozenState(correction: Correction): boolean {
  return correction.state !== 'reverted';
}

/** The words the transcription workers must never change. */
export function frozenWordIds(transcript: TranscriptFile): Set<string> {
  const ids = new Set<string>();
  for (const correction of transcript.corrections) {
    if (isFrozenState(correction)) for (const id of correction.wordIds) ids.add(id);
  }
  return ids;
}

/** Checks the IDs are consecutive in one track's reading order, and returns those words. */
function selectSpan(transcript: TranscriptFile, wordIds: string[]): PlacedWord[] {
  if (wordIds.length === 0) throw new CorrectionConflictError('Empty selection');
  const first = wordIds[0];
  const owner = transcript.segments.find((s) => s.words.some((w) => w.id === first));
  if (owner === undefined) throw new CorrectionConflictError('Selected word no longer exists');
  const words = trackWords(transcript.segments, owner.track);
  const start = words.findIndex((placed) => placed.word.id === first);
  const span = words.slice(start, start + wordIds.length);
  if (span.length !== wordIds.length || span.some((p, i) => p.word.id !== wordIds[i])) {
    throw new CorrectionConflictError('Selection must be consecutive words on one track');
  }
  return span;
}

function pushHistory(
  transcript: TranscriptFile,
  label: string,
  patches: {
    corrections?: Patch<Correction>[];
    speakers?: Patch<Speaker>[];
    overrides?: Patch<SpeakerOverride>[];
  },
): TranscriptFile {
  const entry: HistoryEntry = {
    id: randomUUID(),
    label,
    corrections: patches.corrections ?? [],
    speakers: patches.speakers ?? [],
    overrides: patches.overrides ?? [],
  };
  return { ...transcript, undoStack: [...transcript.undoStack, entry], redoStack: [] };
}

function applyPatchSide<T extends { id: string }>(
  records: T[],
  patches: Patch<T>[],
  side: 'before' | 'after',
): T[] {
  let result = records;
  for (const patch of patches) {
    const value = patch[side];
    const exists = result.some((record) => record.id === patch.id);
    if (value === null) result = result.filter((record) => record.id !== patch.id);
    else if (exists) result = result.map((record) => (record.id === patch.id ? value : record));
    else result = [...result, value];
  }
  return result;
}

function applyEntry(
  transcript: TranscriptFile,
  entry: HistoryEntry,
  side: 'before' | 'after',
): TranscriptFile {
  return {
    ...transcript,
    corrections: applyPatchSide(transcript.corrections, entry.corrections, side),
    speakers: applyPatchSide(transcript.speakers, entry.speakers, side),
    speakerOverrides: applyPatchSide(transcript.speakerOverrides, entry.overrides, side),
  };
}

export function undo(transcript: TranscriptFile): TranscriptFile {
  const entry = transcript.undoStack.at(-1);
  if (entry === undefined) return transcript;
  return {
    ...applyEntry(transcript, entry, 'before'),
    undoStack: transcript.undoStack.slice(0, -1),
    redoStack: [...transcript.redoStack, entry],
  };
}

export function redo(transcript: TranscriptFile): TranscriptFile {
  const entry = transcript.redoStack.at(-1);
  if (entry === undefined) return transcript;
  return {
    ...applyEntry(transcript, entry, 'after'),
    redoStack: transcript.redoStack.slice(0, -1),
    undoStack: [...transcript.undoStack, entry],
  };
}

export interface CorrectionInput {
  wordIds: string[];
  replacement: string;
  remember?: boolean;
  now?: string;
}

/**
 * Adds a correction. Selecting exactly a corrected span edits that correction. A wider selection
 * absorbs the corrections inside it. A selection that cuts through one is refused, because the
 * two texts could not both win.
 */
export function applyCorrection(
  transcript: TranscriptFile,
  input: CorrectionInput,
): { transcript: TranscriptFile; correction: Correction } {
  const span = selectSpan(transcript, input.wordIds);
  const selected = new Set(input.wordIds);
  const now = input.now ?? new Date().toISOString();
  const touching = transcript.corrections.filter(
    (c) => c.state === 'active' && c.wordIds.some((id) => selected.has(id)),
  );

  const same = touching.find(
    (c) => c.wordIds.length === selected.size && c.wordIds.every((id) => selected.has(id)),
  );
  if (same !== undefined) {
    const updated: Correction = {
      ...same,
      replacement: input.replacement,
      remember: input.remember ?? same.remember,
      updatedAt: now,
    };
    const next: TranscriptFile = {
      ...transcript,
      corrections: transcript.corrections.map((c) => (c.id === same.id ? updated : c)),
    };
    return {
      transcript: pushHistory(next, 'Edit correction', {
        corrections: [{ id: same.id, before: same, after: updated }],
      }),
      correction: updated,
    };
  }

  const cutThrough = touching.filter((c) => !c.wordIds.every((id) => selected.has(id)));
  if (cutThrough.length > 0) {
    throw new CorrectionConflictError(
      'Selection cuts through an existing correction',
      cutThrough.map((c) => c.id),
    );
  }

  const firstPlaced = span[0] as PlacedWord;
  const lastPlaced = span.at(-1) as PlacedWord;
  const correction: Correction = {
    id: randomUUID(),
    wordIds: [...input.wordIds],
    replacement: input.replacement,
    original: {
      text: span.map((placed) => placed.word.text).join(' '),
      startMs: firstPlaced.word.startMs,
      endMs: lastPlaced.word.endMs,
      speakerId: firstPlaced.segment.speakerId,
      track: firstPlaced.segment.track,
    },
    remember: input.remember ?? false,
    state: 'active',
    supersededBy: null,
    createdAt: now,
    updatedAt: now,
  };
  const absorbed = touching.map((before) => ({
    before,
    after: { ...before, state: 'superseded', supersededBy: correction.id, updatedAt: now } as const,
  }));
  const absorbedById = new Map(absorbed.map(({ after }) => [after.id, after]));
  const next: TranscriptFile = {
    ...transcript,
    corrections: [...transcript.corrections.map((c) => absorbedById.get(c.id) ?? c), correction],
  };
  return {
    transcript: pushHistory(next, 'Correct text', {
      corrections: [
        ...absorbed.map(({ before, after }) => ({ id: before.id, before, after })),
        { id: correction.id, before: null, after: correction },
      ],
    }),
    correction,
  };
}

/** Takes a correction back. Corrections it had absorbed become active again. */
export function revertCorrection(
  transcript: TranscriptFile,
  correctionId: string,
  now = new Date().toISOString(),
): TranscriptFile {
  const target = transcript.corrections.find((c) => c.id === correctionId);
  if (target === undefined || target.state !== 'active') return transcript;
  const patches: Patch<Correction>[] = [];
  const corrections = transcript.corrections.map((c) => {
    let after: Correction | null = null;
    if (c.id === correctionId) after = { ...c, state: 'reverted', updatedAt: now };
    if (c.supersededBy === correctionId) {
      after = { ...c, state: 'active', supersededBy: null, updatedAt: now };
    }
    if (after === null) return c;
    patches.push({ id: c.id, before: c, after });
    return after;
  });
  return pushHistory({ ...transcript, corrections }, 'Revert correction', {
    corrections: patches,
  });
}

function findSpeaker(transcript: TranscriptFile, speakerId: string): Speaker {
  const speaker = transcript.speakers.find((s) => s.id === speakerId);
  if (speaker === undefined) throw new CorrectionConflictError('Speaker no longer exists');
  return speaker;
}

function replaceSpeakers(
  transcript: TranscriptFile,
  label: string,
  changed: Speaker[],
): TranscriptFile {
  const byId = new Map(changed.map((speaker) => [speaker.id, speaker]));
  const patches = transcript.speakers
    .filter((speaker) => byId.has(speaker.id))
    .map((before) => ({ id: before.id, before, after: byId.get(before.id) as Speaker }));
  const speakers = transcript.speakers.map((speaker) => byId.get(speaker.id) ?? speaker);
  return pushHistory({ ...transcript, speakers }, label, { speakers: patches });
}

export function renameSpeaker(
  transcript: TranscriptFile,
  speakerId: string,
  name: string,
): TranscriptFile {
  const speaker = findSpeaker(transcript, speakerId);
  return replaceSpeakers(transcript, 'Rename speaker', [{ ...speaker, name, userNamed: true }]);
}

export function resolveSpeakerId(transcript: TranscriptFile, speakerId: string): string {
  const byId = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
  let current = speakerId;
  for (let hops = 0; hops <= byId.size; hops += 1) {
    const target = byId.get(current)?.mergedInto;
    if (target === null || target === undefined) return current;
    current = target;
  }
  return current;
}

export function mergeSpeakers(
  transcript: TranscriptFile,
  fromId: string,
  intoId: string,
): TranscriptFile {
  const from = findSpeaker(transcript, fromId);
  findSpeaker(transcript, intoId);
  if (resolveSpeakerId(transcript, intoId) === resolveSpeakerId(transcript, fromId)) {
    throw new CorrectionConflictError('These speakers are already one');
  }
  return replaceSpeakers(transcript, 'Merge speakers', [{ ...from, mergedInto: intoId }]);
}

/** Moves a span to another speaker. Splitting a speaker is a series of these. */
export function reassignSpeaker(
  transcript: TranscriptFile,
  wordIds: string[],
  speakerId: string,
): TranscriptFile {
  findSpeaker(transcript, speakerId);
  const span = selectSpan(transcript, wordIds);
  const override: SpeakerOverride = {
    id: randomUUID(),
    track: (span[0] as PlacedWord).segment.track,
    startMs: (span[0] as PlacedWord).word.startMs,
    endMs: (span.at(-1) as PlacedWord).word.endMs,
    speakerId,
  };
  const next = { ...transcript, speakerOverrides: [...transcript.speakerOverrides, override] };
  return pushHistory(next, 'Reassign speaker', {
    overrides: [{ id: override.id, before: null, after: override }],
  });
}

/** Adds new model text. Live segments arrive per track, so order is restored here. */
export function appendSegments(
  transcript: TranscriptFile,
  segments: Segment[],
  speakers: Speaker[] = [],
): TranscriptFile {
  const known = new Set(transcript.speakers.map((speaker) => speaker.id));
  return {
    ...transcript,
    segments: sortSegments([...transcript.segments, ...segments]),
    speakers: [...transcript.speakers, ...speakers.filter((s) => !known.has(s.id))],
  };
}

function normalizeToken(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/** Longest common subsequence, as index pairs. Inputs are small windows around one frozen run. */
function alignTokens(a: string[], b: string[]): [number, number][] {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const here = i * width + j;
      table[here] =
        a[i] !== '' && a[i] === b[j]
          ? (table[here + width + 1] as number) + 1
          : Math.max(table[here + width] as number, table[here + 1] as number);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] !== '' && a[i] === b[j]) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function midpoint(word: Word): number {
  return (word.startMs + word.endMs) / 2;
}

interface FrozenRun {
  words: Word[];
  segment: Segment;
  /** Index range in the track's old words. */
  from: number;
  to: number;
}

function frozenRuns(oldWords: PlacedWord[], frozen: Set<string>): FrozenRun[] {
  const runs: FrozenRun[] = [];
  let index = 0;
  while (index < oldWords.length) {
    if (!frozen.has((oldWords[index] as PlacedWord).word.id)) {
      index += 1;
      continue;
    }
    const from = index;
    while (index < oldWords.length && frozen.has((oldWords[index] as PlacedWord).word.id)) {
      index += 1;
    }
    const placed = oldWords.slice(from, index);
    runs.push({
      words: placed.map((p) => p.word),
      segment: (placed[0] as PlacedWord).segment,
      from,
      to: index,
    });
  }
  return runs;
}

/** Half-open index range of `incoming` that a run replaces. May be empty; then it is a position. */
interface Region {
  lo: number;
  hi: number;
  /** Moves the run's old times onto the new timeline when `incoming` has no words to take. */
  shiftMs: number;
}

function timeRegion(incoming: Word[], run: FrozenRun, shiftMs: number): Region {
  const start = (run.words[0] as Word).startMs + shiftMs;
  const end = (run.words.at(-1) as Word).endMs + shiftMs;
  let lo = incoming.findIndex((word) => midpoint(word) >= start);
  if (lo === -1) lo = incoming.length;
  let hi = lo;
  while (hi < incoming.length && midpoint(incoming[hi] as Word) <= end) hi += 1;
  return { lo, hi, shiftMs };
}

/**
 * Finds where a frozen run belongs in the new text. The words around it are the best guide,
 * because timing can drift between passes. If they cannot be trusted, time decides. Whatever
 * this returns, the run is kept; a poor guess only moves or duplicates a few nearby model words.
 */
function locateRun(
  run: FrozenRun,
  oldWords: PlacedWord[],
  incoming: Word[],
  frozen: Set<string>,
): Region {
  const before: Word[] = [];
  for (let i = run.from - 1; i >= 0 && before.length < CONTEXT_WORDS; i -= 1) {
    const word = (oldWords[i] as PlacedWord).word;
    if (!frozen.has(word.id)) before.unshift(word);
  }
  const after: Word[] = [];
  for (let i = run.to; i < oldWords.length && after.length < CONTEXT_WORDS; i += 1) {
    const word = (oldWords[i] as PlacedWord).word;
    if (!frozen.has(word.id)) after.push(word);
  }

  const runStart = (run.words[0] as Word).startMs;
  const runEnd = (run.words.at(-1) as Word).endMs;
  const windowStart = incoming.findIndex((word) => word.endMs >= runStart - SEARCH_WINDOW_MS);
  if (windowStart === -1) return timeRegion(incoming, run, 0);
  let windowEnd = windowStart;
  while (
    windowEnd < incoming.length &&
    (incoming[windowEnd] as Word).startMs <= runEnd + SEARCH_WINDOW_MS
  ) {
    windowEnd += 1;
  }

  const oldTokens = [...before, ...run.words, ...after].map((w) => normalizeToken(w.text));
  const newTokens = incoming.slice(windowStart, windowEnd).map((w) => normalizeToken(w.text));
  const pairs = alignTokens(oldTokens, newTokens);
  const afterFrom = before.length + run.words.length;
  const beforePairs = pairs.filter(([i]) => i < before.length);
  const afterPairs = pairs.filter(([i]) => i >= afterFrom);
  const trust = (matches: unknown[], side: Word[]): boolean =>
    matches.length >= Math.min(2, side.length) && side.length > 0;

  const lastBefore = trust(beforePairs, before) ? beforePairs.at(-1) : undefined;
  const firstAfter = trust(afterPairs, after) ? afterPairs[0] : undefined;

  if (lastBefore !== undefined && firstAfter !== undefined) {
    const lo = windowStart + lastBefore[1] + 1;
    const hi = windowStart + firstAfter[1];
    const shiftMs = (incoming[lo - 1] as Word).endMs - (before[lastBefore[0]] as Word).endMs;
    const span = lo < hi ? (incoming[hi - 1] as Word).endMs - (incoming[lo] as Word).startMs : 0;
    if (span <= runEnd - runStart + REGION_SLACK_MS) return { lo, hi, shiftMs };
    return timeRegion(incoming, run, shiftMs);
  }
  if (lastBefore !== undefined) {
    const anchor = (incoming[windowStart + lastBefore[1]] as Word).endMs;
    return timeRegion(incoming, run, anchor - (before[lastBefore[0]] as Word).endMs);
  }
  if (firstAfter !== undefined) {
    const anchor = (incoming[windowStart + firstAfter[1]] as Word).startMs;
    return timeRegion(incoming, run, anchor - (after[firstAfter[0] - afterFrom] as Word).startMs);
  }
  return timeRegion(incoming, run, 0);
}

/** New times only: text and IDs are copied from the frozen words untouched. */
function retimeRun(run: FrozenRun, incoming: Word[], region: Region, floorMs: number): Word[] {
  const oldStart = (run.words[0] as Word).startMs;
  const oldSpan = (run.words.at(-1) as Word).endMs - oldStart;
  let start: number;
  let end: number;
  if (region.lo < region.hi) {
    start = (incoming[region.lo] as Word).startMs;
    end = (incoming[region.hi - 1] as Word).endMs;
  } else {
    start = oldStart + region.shiftMs;
    end = start + oldSpan;
    const next = incoming[region.lo];
    if (next !== undefined && end > next.startMs) end = Math.max(start, next.startMs);
  }
  start = Math.max(start, floorMs);
  end = Math.max(end, start);
  const scale = oldSpan > 0 ? (end - start) / oldSpan : 0;
  return run.words.map((word) => ({
    ...word,
    startMs: Math.round(start + (word.startMs - oldStart) * scale),
    endMs: Math.round(start + (word.endMs - oldStart) * scale),
  }));
}

function mergeTrack(
  replaced: Segment[],
  incomingSegments: Segment[],
  track: Track,
  frozen: Set<string>,
): Segment[] {
  const oldWords = trackWords(replaced, track);
  const runs = frozenRuns(oldWords, frozen);
  const incomingPlaced = trackWords(sortSegments(incomingSegments), track).filter(
    (placed) => !frozen.has(placed.word.id),
  );
  incomingPlaced.sort((a, b) => a.word.startMs - b.word.startMs);
  const incoming = incomingPlaced.map((placed) => placed.word);

  const pass = incomingSegments[0]?.pass ?? 'final';
  const removed = new Set<number>();
  const insertAt = new Map<number, { run: FrozenRun; words: Word[] }[]>();
  let claimedTo = 0;
  let floorMs = 0;
  for (const run of runs) {
    const found = locateRun(run, oldWords, incoming, frozen);
    const lo = Math.max(found.lo, claimedTo);
    const hi = Math.max(found.hi, lo);
    const region = { lo, hi, shiftMs: found.shiftMs };
    const words = retimeRun(run, incoming, region, floorMs);
    for (let i = lo; i < hi; i += 1) removed.add(i);
    insertAt.set(lo, [...(insertAt.get(lo) ?? []), { run, words }]);
    claimedTo = hi;
    floorMs = (words.at(-1) as Word).endMs;
  }

  const rebuilt = new Map<string, Segment>();
  const extra: Segment[] = [];
  let lastSegment: Segment | undefined;
  const addTo = (segment: Segment, words: Word[]): void => {
    const target = rebuilt.get(segment.id) ?? { ...segment, words: [] };
    target.words.push(...words);
    rebuilt.set(segment.id, target);
  };
  for (let i = 0; i <= incomingPlaced.length; i += 1) {
    const placed = incomingPlaced[i];
    for (const { run, words } of insertAt.get(i) ?? []) {
      // Inside a segment the run joins it; between segments or with no text it stands alone.
      const host =
        i < incoming.length && removed.has(i)
          ? placed?.segment
          : placed !== undefined && placed.segment === lastSegment
            ? lastSegment
            : undefined;
      if (host !== undefined) addTo(host, words);
      else extra.push({ ...run.segment, id: randomUUID(), pass, words });
    }
    if (placed === undefined) continue;
    lastSegment = placed.segment;
    if (!removed.has(i)) addTo(placed.segment, [placed.word]);
  }
  return [...rebuilt.values(), ...extra];
}

function mapSpeakers(
  transcript: TranscriptFile,
  replaced: Segment[],
  incoming: Segment[],
  incomingSpeakers: Speaker[],
): Speaker[] {
  const overlap = new Map<string, Map<string, number>>();
  for (const next of incoming) {
    const nextStart = next.words[0]?.startMs ?? 0;
    const nextEnd = next.words.at(-1)?.endMs ?? 0;
    for (const old of replaced) {
      if (old.track !== next.track) continue;
      const oldStart = old.words[0]?.startMs ?? 0;
      const oldEnd = old.words.at(-1)?.endMs ?? 0;
      const shared = Math.min(nextEnd, oldEnd) - Math.max(nextStart, oldStart);
      if (shared <= 0) continue;
      const oldId = resolveSpeakerId(transcript, old.speakerId);
      const row = overlap.get(next.speakerId) ?? new Map<string, number>();
      row.set(oldId, (row.get(oldId) ?? 0) + shared);
      overlap.set(next.speakerId, row);
    }
  }

  const best = (row: Map<string, number> | undefined): [string, number] | undefined =>
    [...(row ?? [])].sort((a, b) => b[1] - a[1])[0];

  const oldById = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
  const hasMergedIn = new Set(transcript.speakers.flatMap((s) => s.mergedInto ?? []));
  const owner = new Map<string, { id: string; shared: number }>();
  for (const speaker of incomingSpeakers) {
    const top = best(overlap.get(speaker.id));
    if (top === undefined) continue;
    const held = owner.get(top[0]);
    if (held === undefined || top[1] > held.shared) {
      owner.set(top[0], { id: speaker.id, shared: top[1] });
    }
  }

  const result: Speaker[] = incomingSpeakers.map((speaker) => {
    const top = best(overlap.get(speaker.id));
    const old = top === undefined ? undefined : oldById.get(top[0]);
    if (old === undefined) return speaker;
    const userConfirmed = old.userNamed || hasMergedIn.has(old.id);
    if (!userConfirmed) return speaker;
    const heir = owner.get(old.id)?.id;
    if (heir === speaker.id) {
      return { ...speaker, name: old.name, profileId: old.profileId, userNamed: old.userNamed };
    }
    return { ...speaker, mergedInto: heir ?? null };
  });

  const newIds = new Set(incomingSpeakers.map((speaker) => speaker.id));
  for (const old of transcript.speakers) {
    if (newIds.has(old.id)) continue;
    const heir = owner.get(old.id)?.id;
    result.push(old.mergedInto === null && heir !== undefined ? { ...old, mergedInto: heir } : old);
  }
  return result;
}

/** Throws unless every kept correction still has all its words with their text unchanged. */
export function verifyCorrectionsIntact(before: TranscriptFile, after: TranscriptFile): void {
  const textById = (transcript: TranscriptFile): Map<string, string> =>
    new Map(transcript.segments.flatMap((s) => s.words.map((w) => [w.id, w.text] as const)));
  const wordsBefore = textById(before);
  const wordsAfter = textById(after);
  for (const correction of after.corrections) {
    if (!isFrozenState(correction)) continue;
    for (const id of correction.wordIds) {
      if (wordsAfter.get(id) === undefined || wordsAfter.get(id) !== wordsBefore.get(id)) {
        throw new CorrectionConflictError('A frozen word changed', [correction.id]);
      }
    }
  }
  const beforeIds = before.corrections.filter(isFrozenState).map((c) => c.id);
  const afterIds = new Set(after.corrections.filter(isFrozenState).map((c) => c.id));
  const missing = beforeIds.filter((id) => !afterIds.has(id));
  if (missing.length > 0) throw new CorrectionConflictError('A correction was lost', missing);
}

export interface ModelReplacement {
  segments: Segment[];
  speakers?: Speaker[];
}

function mergeModel(
  transcript: TranscriptFile,
  kept: Segment[],
  replaced: Segment[],
  incoming: ModelReplacement,
): TranscriptFile {
  const frozen = frozenWordIds(transcript);
  const tracks: Track[] = ['microphone', 'meeting'];
  const merged = tracks.flatMap((track) => mergeTrack(replaced, incoming.segments, track, frozen));
  const next: TranscriptFile = {
    ...transcript,
    segments: sortSegments([...kept, ...merged]),
    speakers: mapSpeakers(transcript, replaced, incoming.segments, incoming.speakers ?? []),
  };
  verifyCorrectionsIntact(transcript, next);
  return next;
}

/**
 * Replaces the whole model layer. Only correction-history entries referencing words retained by
 * the frozen-span merge may survive. Speaker history needs separate verified rebasing.
 */
export function applyFinalPass(
  transcript: TranscriptFile,
  incoming: ModelReplacement,
): TranscriptFile {
  const next = mergeModel(transcript, [], transcript.segments, incoming);
  const ids = new Set(next.segments.flatMap((segment) => segment.words.map((word) => word.id)));
  const safe = (entry: HistoryEntry): boolean =>
    entry.speakers.length === 0 &&
    entry.overrides.length === 0 &&
    entry.corrections.every((patch) =>
      [patch.before, patch.after].every(
        (correction) =>
          correction === null || correction.wordIds.every((wordId) => ids.has(wordId)),
      ),
    );
  return {
    ...next,
    undoStack: transcript.undoStack.filter(safe),
    redoStack: transcript.redoStack.filter(safe),
  };
}

/**
 * Lets the live pass revise provisional segments under the same freeze rule. A revision that
 * cannot keep a correction whole is dropped: the final pass will replace that text anyway.
 */
export function replaceLiveSegments(
  transcript: TranscriptFile,
  segmentIds: string[],
  incoming: ModelReplacement,
): TranscriptFile {
  const ids = new Set(segmentIds);
  const replaced = transcript.segments.filter((segment) => ids.has(segment.id));
  const kept = transcript.segments.filter((segment) => !ids.has(segment.id));
  const known = new Set(transcript.speakers.map((speaker) => speaker.id));
  const speakers = (incoming.speakers ?? []).filter((speaker) => !known.has(speaker.id));
  const allIncoming = { segments: incoming.segments, speakers: [] };
  try {
    const next = mergeModel(transcript, kept, replaced, allIncoming);
    return { ...next, speakers: [...transcript.speakers, ...speakers] };
  } catch (error) {
    if (error instanceof CorrectionConflictError) return transcript;
    throw error;
  }
}

export interface DisplayToken {
  text: string;
  startMs: number;
  endMs: number;
  wordIds: string[];
  /** Set when a user correction supplies this text. */
  correctionId: string | null;
  /** The model text beneath a correction. */
  originalText: string | null;
}

export interface DisplaySegment {
  id: string;
  speakerId: string;
  track: Track;
  pass: Segment['pass'];
  tokens: DisplayToken[];
}

function overrideFor(
  overrides: SpeakerOverride[],
  track: Track,
  atMs: number,
): SpeakerOverride | undefined {
  // The latest override wins, as it was the last thing the user said.
  for (let i = overrides.length - 1; i >= 0; i -= 1) {
    const override = overrides[i] as SpeakerOverride;
    if (override.track === track && atMs >= override.startMs && atMs <= override.endMs) {
      return override;
    }
  }
  return undefined;
}

/** The transcript as shown, exported and searched. A user correction always wins. */
export function resolveDisplay(transcript: TranscriptFile): DisplaySegment[] {
  const wordEndById = new Map(
    transcript.segments.flatMap((segment) =>
      segment.words.map((word) => [word.id, word.endMs] as const),
    ),
  );
  const active = new Map<string, Correction>();
  for (const correction of transcript.corrections) {
    if (correction.state !== 'active') continue;
    for (const id of correction.wordIds) active.set(id, correction);
  }

  const display: DisplaySegment[] = [];
  for (const segment of transcript.segments) {
    let current: DisplaySegment | undefined;
    let part = 0;
    const push = (token: DisplayToken, speakerId: string): void => {
      if (current?.speakerId !== speakerId) {
        current = {
          id: part === 0 ? segment.id : `${segment.id}:${part}`,
          speakerId,
          track: segment.track,
          pass: segment.pass,
          tokens: [],
        };
        part += 1;
        display.push(current);
      }
      current.tokens.push(token);
    };
    for (const word of segment.words) {
      const override = overrideFor(transcript.speakerOverrides, segment.track, midpoint(word));
      const speakerId = resolveSpeakerId(transcript, override?.speakerId ?? segment.speakerId);
      const correction = active.get(word.id);
      if (correction === undefined) {
        const token = {
          text: word.text,
          startMs: word.startMs,
          endMs: word.endMs,
          wordIds: [word.id],
          correctionId: null,
          originalText: null,
        };
        push(token, speakerId);
      } else if (correction.wordIds[0] === word.id) {
        const last = correction.wordIds.at(-1) as string;
        push(
          {
            text: correction.replacement,
            startMs: word.startMs,
            endMs: wordEndById.get(last) ?? correction.original.endMs,
            wordIds: correction.wordIds,
            correctionId: correction.id,
            originalText: correction.original.text,
          },
          speakerId,
        );
      }
    }
  }
  return display;
}

/** Speakers still shown in the transcript, for the UI's list. */
export function activeSpeakers(transcript: TranscriptFile): Speaker[] {
  const shown = new Set(resolveDisplay(transcript).map((segment) => segment.speakerId));
  return transcript.speakers.filter((speaker) => shown.has(speaker.id));
}
