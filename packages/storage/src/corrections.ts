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

/** A merge settles final ownership of a speaker the final pass flagged for review. */
function clearReview(speaker: Speaker): Speaker {
  const rest = { ...speaker };
  delete rest.needsManualResolution;
  return rest;
}

export function assignSpeakerProfiles(
  transcript: TranscriptFile,
  assignments: { speakerId: string; profileId: string; name: string }[],
): TranscriptFile {
  return replaceSpeakers(
    transcript,
    'Recognize speakers',
    assignments.map((assignment) => ({
      ...findSpeaker(transcript, assignment.speakerId),
      profileId: assignment.profileId,
      name: assignment.name,
      userNamed: false,
    })),
  );
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
  const merged = clearReview({ ...from, mergedInto: intoId });
  delete merged.modelMerge;
  const target = findSpeaker(transcript, intoId);
  return replaceSpeakers(
    transcript,
    'Merge speakers',
    target.needsManualResolution === true ? [merged, clearReview(target)] : [merged],
  );
}

export function splitSpeaker(
  transcript: TranscriptFile,
  wordIds: string[],
  newLabel: string,
): TranscriptFile {
  const span = selectSpan(transcript, wordIds);
  const effective = new Set(
    span.map(({ word, segment }) => {
      const override = overrideFor(transcript.speakerOverrides, segment.track, midpoint(word));
      return resolveSpeakerId(transcript, override?.speakerId ?? segment.speakerId);
    }),
  );
  if (effective.size !== 1) {
    throw new CorrectionConflictError('Select words from one speaker.');
  }
  const first = span[0] as PlacedWord;
  const last = span.at(-1) as PlacedWord;
  const startMs = first.word.startMs;
  const endMs = last.word.endMs;
  const selectedIds = new Set(span.map(({ word }) => word.id));
  // A timestamp override must change exactly the selected words under midpoint display rules.
  const changesDifferentWords = trackWords(transcript.segments, first.segment.track).some(
    ({ word }) => {
      const at = midpoint(word);
      return selectedIds.has(word.id) !== (at >= startMs && at <= endMs);
    },
  );
  if (changesDifferentWords) {
    throw new CorrectionConflictError('The selected words overlap other speech.');
  }
  const speaker: Speaker = {
    id: randomUUID(),
    label: newLabel,
    name: newLabel,
    profileId: null,
    userNamed: true,
    mergedInto: null,
  };
  const override: SpeakerOverride = {
    id: randomUUID(),
    track: first.segment.track,
    startMs: first.word.startMs,
    endMs: last.word.endMs,
    speakerId: speaker.id,
  };
  return pushHistory(
    {
      ...transcript,
      speakers: [...transcript.speakers, speaker],
      speakerOverrides: [...transcript.speakerOverrides, override],
    },
    'Split speaker',
    {
      speakers: [{ id: speaker.id, before: null, after: speaker }],
      overrides: [{ id: override.id, before: null, after: override }],
    },
  );
}

/** Moves a span to an existing speaker. */
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

function promoteLiveSpeakers(existing: Speaker[], incoming: Speaker[]): Speaker[] {
  return existing.map((s) => {
    const next = incoming.find((n) => n.id === s.id);
    return next &&
      /-live-[1-9][0-9]{0,8}$/.test(s.id) &&
      s.label === 'Speaker ?' &&
      !s.userNamed &&
      s.name === null &&
      s.profileId === null &&
      s.mergedInto === null &&
      /^Speaker [1-9][0-9]{0,8}$/.test(next.label)
      ? { ...s, label: next.label }
      : s;
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
    speakers: [
      ...promoteLiveSpeakers(transcript.speakers, speakers),
      ...speakers.filter((s) => !known.has(s.id)),
    ],
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

const BIN_MS = 10;
/** Fail-safe guards, calibrated on one meeting: they stop wrong names, they do not claim accuracy. */
const MIN_SHARED_MS = 10_000;
const MIN_LIVE_SHARE = 0.7;
const MIN_MARGIN = 0.2;
const FALLBACK_SPEAKER = 'meeting';
const YOU_SPEAKER = 'you';

/** Meeting-track speech per speaker as 10 ms bins, so overlapping words count once. */
function speechBins(
  segments: Segment[],
  speakerOf: (segment: Segment, word: Word) => string,
): Map<string, Set<number>> {
  const result = new Map<string, Set<number>>();
  for (const segment of segments) {
    if (segment.track !== 'meeting') continue;
    for (const word of segment.words) {
      const id = speakerOf(segment, word);
      if (id === FALLBACK_SPEAKER) continue;
      const bins = result.get(id) ?? new Set<number>();
      result.set(id, bins);
      const from = Math.floor(word.startMs / BIN_MS);
      const to = Math.max(from + 1, Math.ceil(word.endMs / BIN_MS));
      for (let bin = from; bin < to; bin += 1) bins.add(bin);
    }
  }
  return result;
}

function sharedBins(a: Set<number>, b: Set<number>): number {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const bin of small) if (large.has(bin)) count += 1;
  return count;
}

/** One-to-one assignment (row -> column or -1) maximizing total weight. Sizes are tiny. */
function bestAssignment(weights: number[][], columns: number): number[] {
  const memo = new Map<string, { total: number; picks: number[] }>();
  const solve = (row: number, used: boolean[]): { total: number; picks: number[] } => {
    if (row === weights.length) return { total: 0, picks: [] };
    const key = `${row}:${used.map((u) => (u ? 1 : 0)).join('')}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best: { total: number; picks: number[] } | undefined;
    for (let column = 0; column < columns; column += 1) {
      const weight = (weights[row] as number[])[column] as number;
      if (used[column] === true || weight <= 0) continue;
      const rest = solve(
        row + 1,
        used.map((u, i) => u || i === column),
      );
      // Strict ">" lets the earlier row win a tie, so the result is deterministic.
      if (best === undefined || rest.total + weight > best.total) {
        best = { total: rest.total + weight, picks: [column, ...rest.picks] };
      }
    }
    const skip = solve(row + 1, used);
    if (best === undefined || skip.total > best.total) {
      best = { total: skip.total, picks: [-1, ...skip.picks] };
    }
    memo.set(key, best);
    return best;
  };
  return solve(0, new Array<boolean>(columns).fill(false)).picks;
}

interface SpeakerTransfer {
  speakers: Speaker[];
  /** Live speaker ID -> final speaker ID, for names that safely carried over. */
  mapping: Map<string, string>;
  /** User-named speakers kept as they were because no final speaker was clearly theirs. */
  flagged: Set<string>;
}

/**
 * Carries user-given names from live speakers to final speakers only where the overlap is
 * unambiguous. Everything else keeps the user's record and is flagged for review. Final speakers
 * are never merged with each other here.
 */
function transferSpeakers(
  transcript: TranscriptFile,
  replaced: Segment[],
  incoming: Segment[],
  rawIncomingSpeakers: Speaker[],
): SpeakerTransfer {
  const incomingSpeakers = rawIncomingSpeakers.filter(
    (speaker) =>
      speaker.id !== YOU_SPEAKER || !transcript.speakers.some((s) => s.id === YOU_SPEAKER),
  );
  const liveBins = speechBins(replaced, (segment, word) =>
    resolveSpeakerId(
      transcript,
      overrideFor(transcript.speakerOverrides, segment.track, midpoint(word))?.speakerId ??
        segment.speakerId,
    ),
  );
  const finalBins = speechBins(incoming, (segment) => segment.speakerId);
  const byId = new Map(transcript.speakers.map((speaker) => [speaker.id, speaker]));
  const candidates = [...liveBins.keys()].filter((id) => {
    const speaker = byId.get(id);
    return (
      id !== YOU_SPEAKER && speaker?.userNamed === true && speaker.needsManualResolution !== true
    );
  });
  const finals = incomingSpeakers.map((speaker) => speaker.id).filter((id) => finalBins.has(id));

  const shared = candidates.map((live) =>
    finals.map((final) =>
      sharedBins(liveBins.get(live) as Set<number>, finalBins.get(final) as Set<number>),
    ),
  );
  const picks = bestAssignment(shared, finals.length);
  const mapping = new Map<string, string>();
  const flagged = new Set<string>();
  candidates.forEach((live, row) => {
    const column = picks[row] ?? -1;
    const speech = (liveBins.get(live) as Set<number>).size;
    const row_ = shared[row] as number[];
    if (column >= 0 && speech > 0) {
      const sharedMs = (row_[column] as number) * BIN_MS;
      const coverage = (row_[column] as number) / speech;
      const others = row_.filter((_, i) => i !== column);
      const margin = coverage - Math.max(0, ...others) / speech;
      // Compare in bins and rounded percentages' worth of float slack so exact boundaries hold.
      if (
        sharedMs >= MIN_SHARED_MS &&
        coverage >= MIN_LIVE_SHARE - 1e-9 &&
        margin >= MIN_MARGIN - 1e-9
      ) {
        mapping.set(live, finals[column] as string);
        return;
      }
    }
    flagged.add(live);
  });

  const transferred = new Map([...mapping].map(([live, final]) => [final, live]));
  const result: Speaker[] = incomingSpeakers.map((speaker) => {
    const live = transferred.get(speaker.id);
    const old = live === undefined ? undefined : byId.get(live);
    return old === undefined ? speaker : { ...speaker, name: old.name, userNamed: old.userNamed };
  });
  for (const old of transcript.speakers) {
    if (mapping.has(old.id)) continue;
    const mergedInto =
      old.mergedInto === null ? null : (mapping.get(old.mergedInto) ?? old.mergedInto);
    const kept = mergedInto === old.mergedInto ? old : { ...old, mergedInto };
    result.push(flagged.has(old.id) ? { ...kept, needsManualResolution: true } : kept);
  }
  return { speakers: result, mapping, flagged };
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
  };
  verifyCorrectionsIntact(transcript, next);
  return next;
}

/** Gives incoming speakers a new ID when it already names a speaker in the file. */
function rekeyIncoming(transcript: TranscriptFile, incoming: ModelReplacement): ModelReplacement {
  const taken = new Set(transcript.speakers.map((speaker) => speaker.id));
  const incomingIds = new Set((incoming.speakers ?? []).map((speaker) => speaker.id));
  const renamed = new Map<string, string>();
  for (const speaker of incoming.speakers ?? []) {
    // The microphone speaker is one reserved identity; the existing record stays the owner.
    if (!taken.has(speaker.id) || speaker.id === YOU_SPEAKER) continue;
    const base = `final:${transcript.revision + 1}:${speaker.id}`;
    let candidate = base;
    for (let n = 2; taken.has(candidate) || incomingIds.has(candidate); n += 1) {
      candidate = `${base}:${n}`;
    }
    renamed.set(speaker.id, candidate);
  }
  if (renamed.size === 0) return incoming;
  const rename = (id: string): string => renamed.get(id) ?? id;
  return {
    segments: incoming.segments.map((segment) =>
      renamed.has(segment.speakerId)
        ? { ...segment, speakerId: rename(segment.speakerId) }
        : segment,
    ),
    speakers: (incoming.speakers ?? []).map((speaker) => ({
      ...speaker,
      id: rename(speaker.id),
      mergedInto: speaker.mergedInto === null ? null : rename(speaker.mergedInto),
    })),
  };
}

/**
 * Re-points one history entry at the speakers that now exist. Returns null when the entry cannot
 * be proven safe: a record that disagrees with its own ID, a correction whose words are gone, or a
 * reference to a speaker that no longer exists.
 */
function rebaseEntry(
  entry: HistoryEntry,
  wordIds: Set<string>,
  transfer: SpeakerTransfer,
  finals: Map<string, Speaker>,
  known: Set<string>,
  retired: Set<string>,
): HistoryEntry | null {
  const remap = (id: string): string => transfer.mapping.get(id) ?? id;
  const link = (id: string | null): string | null => (id === null ? null : remap(id));
  const sides = <T>(patch: Patch<T>): (T | null)[] => [patch.before, patch.after];
  const corrections = entry.corrections.every((patch) =>
    sides(patch).every(
      (c) => c === null || (c.id === patch.id && c.wordIds.every((id) => wordIds.has(id))),
    ),
  );
  if (!corrections) return null;

  const rebaseSpeaker = (speaker: Speaker | null): Speaker | null => {
    if (speaker === null) return null;
    const final = finals.get(remap(speaker.id));
    if (transfer.mapping.has(speaker.id) && final !== undefined) {
      return {
        ...final,
        name: speaker.name,
        userNamed: speaker.userNamed,
        mergedInto: link(speaker.mergedInto),
      };
    }
    const next = { ...speaker, mergedInto: link(speaker.mergedInto) };
    return transfer.flagged.has(speaker.id) ? { ...next, needsManualResolution: true } : next;
  };
  const speakers: Patch<Speaker>[] = [];
  for (const patch of entry.speakers) {
    if (retired.has(patch.id) || sides(patch).some((s) => s !== null && s.id !== patch.id)) {
      return null;
    }
    const rebased = {
      id: remap(patch.id),
      before: rebaseSpeaker(patch.before),
      after: rebaseSpeaker(patch.after),
    };
    const dangling = [rebased.before, rebased.after].some(
      (s) => s !== null && s.mergedInto !== null && !known.has(s.mergedInto),
    );
    if (dangling) return null;
    speakers.push(rebased);
  }
  const overrides: Patch<SpeakerOverride>[] = [];
  for (const patch of entry.overrides) {
    if (sides(patch).some((o) => o !== null && o.id !== patch.id)) return null;
    const fix = (o: SpeakerOverride | null): SpeakerOverride | null =>
      o === null ? null : { ...o, speakerId: remap(o.speakerId) };
    const rebased = { id: patch.id, before: fix(patch.before), after: fix(patch.after) };
    if (sides(rebased).some((o) => o !== null && !known.has(o.speakerId))) return null;
    overrides.push(rebased);
  }
  return { ...entry, corrections: entry.corrections, speakers, overrides };
}

/** Speaker and override IDs an entry touches, for dropping related entries together. */
function touchedIds(entry: HistoryEntry): string[] {
  return [
    ...entry.speakers.map((patch) => `speaker:${patch.id}`),
    ...entry.overrides.flatMap((patch) => [
      `override:${patch.id}`,
      ...[patch.before, patch.after].flatMap((o) => (o === null ? [] : [`speaker:${o.speakerId}`])),
    ]),
  ];
}

/**
 * Replaces the whole model layer. Correction history survives where its words were retained.
 * Speaker history is rebased onto transferred speakers; an entry that cannot be proven safe is
 * dropped together with every entry sharing a speaker or override with it. Current speaker and
 * override decisions stay saved either way.
 */
export function applyFinalPass(
  transcript: TranscriptFile,
  rawIncoming: ModelReplacement,
): TranscriptFile {
  const incoming = rekeyIncoming(transcript, rawIncoming);
  const merged = mergeModel(transcript, [], transcript.segments, incoming);
  const transfer = transferSpeakers(
    transcript,
    transcript.segments,
    incoming.segments,
    incoming.speakers ?? [],
  );
  const remap = (id: string): string => transfer.mapping.get(id) ?? id;
  const next: TranscriptFile = {
    ...merged,
    speakers: transfer.speakers,
    segments: merged.segments.map((segment) =>
      transfer.mapping.has(segment.speakerId)
        ? { ...segment, speakerId: remap(segment.speakerId) }
        : segment,
    ),
    speakerOverrides: transcript.speakerOverrides.map((override) =>
      transfer.mapping.has(override.speakerId)
        ? { ...override, speakerId: remap(override.speakerId) }
        : override,
    ),
  };

  const wordIds = new Set(next.segments.flatMap((s) => s.words.map((w) => w.id)));
  const finals = new Map(next.speakers.map((speaker) => [speaker.id, speaker]));
  // An old speaker nothing points to any more is retired: history about it would act on nobody.
  const referenced = new Set<string>([
    ...next.segments.map((segment) => segment.speakerId),
    ...next.speakerOverrides.map((override) => override.speakerId),
  ]);
  for (const id of [...referenced]) {
    for (let hop = 0, at = finals.get(id); at?.mergedInto && hop < finals.size; hop += 1) {
      referenced.add(at.mergedInto);
      at = finals.get(at.mergedInto);
    }
  }
  const previous = new Set(transcript.speakers.map((speaker) => speaker.id));
  const incomingIds = new Set((incoming.speakers ?? []).map((speaker) => speaker.id));
  const retired = new Set(
    [...previous].filter(
      (id) =>
        !transfer.mapping.has(id) &&
        !transfer.flagged.has(id) &&
        !incomingIds.has(id) &&
        !referenced.has(id),
    ),
  );
  const known = new Set([...finals.keys()].filter((id) => !retired.has(id)));
  for (const entry of [...transcript.undoStack, ...transcript.redoStack]) {
    for (const patch of entry.speakers) {
      if (!previous.has(patch.id)) known.add(remap(patch.id));
    }
  }
  const stacks = [transcript.undoStack, transcript.redoStack].map((stack) =>
    stack.map((entry) => ({
      entry,
      rebased: rebaseEntry(entry, wordIds, transfer, finals, known, retired),
    })),
  );
  const dropped = new Set<string>();
  for (const stack of stacks) {
    for (const item of stack)
      if (item.rebased === null) for (const id of touchedIds(item.entry)) dropped.add(id);
  }
  // Keep dropping until no surviving entry shares an ID with a dropped one.
  for (let changed = true; changed;) {
    changed = false;
    for (const stack of stacks) {
      for (const item of stack) {
        if (item.rebased === null) continue;
        if (touchedIds(item.entry).some((id) => dropped.has(id))) {
          item.rebased = null;
          for (const id of touchedIds(item.entry)) dropped.add(id);
          changed = true;
        }
      }
    }
  }
  const keep = (stack: (typeof stacks)[number]): HistoryEntry[] =>
    stack.flatMap((item) => (item.rebased === null ? [] : [item.rebased]));
  return { ...next, undoStack: keep(stacks[0] ?? []), redoStack: keep(stacks[1] ?? []) };
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
  const protectedIds = protectedLiveSpeakers(transcript);
  const oldOwner = new Map(
    replaced.flatMap((s) => s.words.map((w) => [w.id, s.speakerId] as const)),
  );
  if (
    incoming.segments.some((s) =>
      s.words.some((w) => {
        const old = oldOwner.get(w.id);
        return (
          old !== undefined &&
          old !== s.speakerId &&
          (protectedIds.has(old) || protectedIds.has(s.speakerId))
        );
      }),
    )
  )
    return transcript;
  const kept = transcript.segments.filter((segment) => !ids.has(segment.id));
  const known = new Set(transcript.speakers.map((speaker) => speaker.id));
  const speakers = (incoming.speakers ?? []).filter((speaker) => !known.has(speaker.id));
  const allIncoming = { segments: incoming.segments, speakers: [] };
  try {
    const next = mergeModel(transcript, kept, replaced, allIncoming);
    return {
      ...next,
      speakers: [...promoteLiveSpeakers(transcript.speakers, incoming.speakers ?? []), ...speakers],
    };
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
  return transcript.speakers.filter(
    (speaker) =>
      shown.has(speaker.id) ||
      (speaker.needsManualResolution === true && speaker.mergedInto === null),
  );
}

/** Internal worker metadata, never part of the UI contract. */
export interface LiveSpeakerMerge {
  from: string;
  into: string;
  workerRun: string;
  generation: number;
  order: number;
  label: string;
}

export function mergeLiveSpeaker(t: TranscriptFile, request: LiveSpeakerMerge): TranscriptFile {
  const { from, into, workerRun, generation, order, label } = request;
  if (
    !/^[a-zA-Z0-9-]{1,128}$/.test(workerRun) ||
    !Number.isSafeInteger(generation) ||
    generation < 0 ||
    !Number.isSafeInteger(order) ||
    order < 1 ||
    !/^(Speaker \?|Speaker [1-9][0-9]{0,8})$/.test(label)
  )
    return t;
  const local = (id: string) =>
    id.startsWith(`${workerRun}-live-`) && /^[1-9][0-9]{0,8}$/.test(id.slice(workerRun.length + 6));
  if (
    !local(from) ||
    !local(into) ||
    from === into ||
    t.segments.some((s) => s.track === 'meeting' && s.pass === 'final')
  )
    return t;
  const a = t.speakers.find((s) => s.id === from);
  const b = t.speakers.find((s) => s.id === into);
  if (
    !a ||
    !b ||
    (a.modelMerge && (generation < a.modelMerge.generation || order <= a.modelMerge.order))
  )
    return t;
  const protectedIds = protectedLiveSpeakers(t);
  if (protectedIds.has(from) || protectedIds.has(into)) return t;
  const seen = new Set([from]);
  let target: Speaker | undefined = b;
  while (target) {
    if (seen.has(target.id)) return t;
    seen.add(target.id);
    if (!target.mergedInto) break;
    target = t.speakers.find((s) => s.id === target!.mergedInto);
  }
  if (!target || a.mergedInto !== null) return t;
  return {
    ...t,
    speakers: t.speakers.map((s) =>
      s.id === from
        ? { ...s, mergedInto: into, modelMerge: { workerRun, generation, order } }
        : s.id === target.id && s.label === 'Speaker ?' && label !== 'Speaker ?'
          ? { ...s, label }
          : s,
    ),
  };
}

function protectedLiveSpeakers(t: TranscriptFile): Set<string> {
  const protectedIds = new Set<string>();
  const protect = (s: Speaker | null) => {
    if (s) {
      protectedIds.add(s.id);
      if (s.mergedInto) protectedIds.add(s.mergedInto);
    }
  };
  for (const s of t.speakers)
    if (
      s.userNamed ||
      s.name !== null ||
      s.profileId !== null ||
      (s.mergedInto !== null && !s.modelMerge)
    )
      protect(s);
  for (const h of [...t.undoStack, ...t.redoStack]) {
    for (const p of h.speakers) {
      protectedIds.add(p.id);
      protect(p.before);
      protect(p.after);
    }
    for (const p of h.overrides)
      for (const o of [p.before, p.after]) if (o) protectedIds.add(o.speakerId);
  }
  for (const o of t.speakerOverrides) {
    protectedIds.add(o.speakerId);
    for (const s of t.segments)
      if (s.track === o.track && s.words.some((w) => w.endMs > o.startMs && w.startMs < o.endMs))
        protectedIds.add(s.speakerId);
  }
  // Protect the entire connected alias component on either side of a user decision.
  for (let i = 0; i < t.speakers.length; i++) {
    let changed = false;
    for (const s of t.speakers)
      if (s.mergedInto && (protectedIds.has(s.id) || protectedIds.has(s.mergedInto))) {
        const size = protectedIds.size;
        protectedIds.add(s.id);
        protectedIds.add(s.mergedInto);
        changed ||= size !== protectedIds.size;
      }
    if (!changed) break;
  }
  return protectedIds;
}
