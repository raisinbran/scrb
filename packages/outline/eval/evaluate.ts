import { buildBlocks } from '../src/blocks.js';
import { itemEmbeddingTexts } from '../src/embed.js';
import { matchOutline } from '../src/match.js';
import { parseOutline } from '../src/parse.js';
import type { Tuning } from '../src/constants.js';
import type { PlacedBlock } from '../src/types.js';
import { listMeetings, loadMeeting, type AmiMeeting } from './ami.js';
import { buildReference, type Reference } from './reference.js';

export type VariantName = 'inOrder' | 'jumpBack' | 'deletedHeading' | 'extraHeading';
export const VARIANTS: VariantName[] = ['inOrder', 'jumpBack', 'deletedHeading', 'extraHeading'];
const EXTRA_HEADING = 'Holiday party catering and parking permits';

interface Variant {
  entries: Reference['entries'];
  /** Reference entry index (original) to variant entry index; undefined = no heading any more. */
  map: Map<number, number>;
}

function groups(ref: Reference): number[][] {
  const out: number[][] = [];
  ref.entries.forEach((e, i) => (e.level === 1 ? out.push([i]) : out[out.length - 1]!.push(i)));
  return out;
}

function makeVariant(ref: Reference, name: VariantName): Variant | null {
  const g = groups(ref);
  if (name !== 'inOrder' && g.length < 3) return null;
  let order = g.map((x) => x);
  let extraAt = -1;
  if (name === 'jumpBack') [order[1], order[2]] = [order[2]!, order[1]!];
  if (name === 'deletedHeading') order = order.filter((_, i) => i !== Math.floor(g.length / 2));
  if (name === 'extraHeading') extraAt = Math.floor(g.length / 2);
  const entries: Reference['entries'] = [];
  const map = new Map<number, number>();
  order.forEach((group, gi) => {
    if (gi === extraAt) entries.push({ level: 1, text: EXTRA_HEADING });
    for (const old of group) {
      map.set(old, entries.length);
      entries.push(ref.entries[old]!);
    }
  });
  return { entries, map };
}

function outlineText(entries: Reference['entries']): string {
  let a = 0;
  let b = 0;
  return entries
    .map((e) =>
      e.level === 1 ? `${((a += 1), (b = 0), a)}. ${e.text}` : `${a}.${(b += 1)} ${e.text}`,
    )
    .join('\n');
}

export interface Tally {
  ms: number;
  correct: number;
  inOutlineMs: number;
  inOutlineCorrect: number;
  likelyMs: number;
  likelyCorrect: number;
  unsureMs: number;
  notPlacedMs: number;
  strictCorrect: number;
  boundaryErrorsSec: number[];
  meetings: number;
  meetingAcc: number[];
}
const empty = (): Tally => ({
  ms: 0,
  correct: 0,
  inOutlineMs: 0,
  inOutlineCorrect: 0,
  likelyMs: 0,
  likelyCorrect: 0,
  unsureMs: 0,
  notPlacedMs: 0,
  strictCorrect: 0,
  boundaryErrorsSec: [],
  meetings: 0,
  meetingAcc: [],
});

function boundaries(labels: (string | null)[], meeting: AmiMeeting): number[] {
  const MIN_RUN_MS = 10_000;
  const runs: { label: string | null; start: number; end: number }[] = [];
  labels.forEach((l, i) => {
    const w = meeting.words[i]!;
    const last = runs[runs.length - 1];
    if (last && last.label === l) last.end = w.endMs;
    else runs.push({ label: l, start: w.startMs, end: w.endMs });
  });
  const solid = runs.filter((r) => r.end - r.start >= MIN_RUN_MS);
  const out: number[] = [];
  for (let i = 1; i < solid.length; i += 1)
    if (solid[i]!.label !== solid[i - 1]!.label) out.push(solid[i]!.start);
  return out;
}

function score(
  meeting: AmiMeeting,
  ref: Reference,
  variant: Variant,
  placed: PlacedBlock[],
  itemOfIndex: string[],
  t: Tally,
): void {
  const found: (string | null)[] = new Array(meeting.words.length).fill(null);
  const conf: string[] = new Array(meeting.words.length).fill('unsure');
  for (const b of placed)
    for (let i = b.first; i <= b.last; i += 1) {
      found[i] = b.itemId;
      conf[i] = b.confidence;
    }
  const truth: (string | null)[] = ref.wordEntry.map((e) => {
    if (e === null) return null;
    const v = variant.map.get(e);
    return v === undefined ? null : itemOfIndex[v]!;
  });
  let ms = 0;
  let ok = 0;
  meeting.words.forEach((w, i) => {
    const d = w.endMs - w.startMs;
    const right = found[i] === truth[i];
    t.ms += d;
    ms += d;
    if (right) {
      t.correct += d;
      ok += d;
    }
    if (truth[i] !== null) {
      t.inOutlineMs += d;
      if (right) t.inOutlineCorrect += d;
    }
    if (found[i] === null) t.notPlacedMs += d;
    else if (conf[i] === 'likely') {
      t.likelyMs += d;
      if (right) t.likelyCorrect += d;
    } else t.unsureMs += d;
    // Strict: an unsure placement counts as not placed.
    const strict = found[i] !== null && conf[i] === 'unsure' ? null : found[i];
    if (strict === truth[i]) t.strictCorrect += d;
  });
  t.meetings += 1;
  t.meetingAcc.push(ok / ms);
  const tb = boundaries(truth, meeting);
  const fb = boundaries(found, meeting);
  if (fb.length > 0)
    for (const x of tb)
      t.boundaryErrorsSec.push(Math.min(...fb.map((y) => Math.abs(y - x))) / 1000);
  else
    for (const x of tb)
      t.boundaryErrorsSec.push((meeting.words[meeting.words.length - 1]!.endMs - x) / 1000);
}

export interface EvalResult {
  results: Map<string, Tally>;
  used: number;
  skipped: number;
}

/** Runs every variant on every AMI meeting. `only` picks a subset by meeting position. */
export function evaluate(
  dir: string,
  tuning: Partial<Tuning> = {},
  only?: (position: number) => boolean,
  /** Level B: looks up the sentence vector of a text (from a precomputed cache). */
  vec?: (text: string) => Float32Array,
): EvalResult {
  const results = new Map<string, Tally>();
  const tally = (k: string): Tally => results.get(k) ?? (results.set(k, empty()), results.get(k)!);
  let used = 0;
  let skipped = 0;
  let position = -1;
  for (const id of listMeetings(dir)) {
    position += 1;
    if (only && !only(position)) continue;
    const meeting = loadMeeting(dir, id);
    if (!meeting) {
      skipped += 1;
      continue;
    }
    const ref = buildReference(meeting);
    if (groups(ref).length < 2) {
      skipped += 1;
      continue;
    }
    used += 1;
    const kind = meeting.freeText ? 'free-text labels' : 'ontology labels';
    for (const name of VARIANTS) {
      const variant = makeVariant(ref, name);
      if (!variant) continue;
      const items = parseOutline(outlineText(variant.entries)).items;
      const semantic = vec
        ? {
            blocks: buildBlocks(meeting.words).map((b) => vec(b.text)),
            items: itemEmbeddingTexts(items).map(vec),
          }
        : undefined;
      const placed = matchOutline(meeting.words, items, { tuning, semantic });
      const ids = items.map((i) => i.id);
      for (const key of [`${name}|all`, `${name}|${kind}`])
        score(meeting, ref, variant, placed, ids, tally(key));
    }
  }
  return { results, used, skipped };
}
