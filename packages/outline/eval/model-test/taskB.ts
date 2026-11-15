import { matchPoints, SCORER, type Cite, type Embed, type Word } from './match.js';
import { flatten, type PartialNotes } from './partial.js';
import { metric, MIN, norm, type Metric, type RefTopic } from './taskA.js';

/** What a model proposes in Task B. Ids refer to the partial notes shown to it. */
export interface TaskBOutput {
  additions: { topic: string; text: string; cite: Cite | null }[];
  moves: { id: string; toTopic: string }[];
  edits: { id: string; kind: 'reword' | 'delete' }[];
}

export interface TaskBResult {
  additionsRecall: Metric;
  additionsPrecision: Metric;
  movesRecall: Metric;
  movesPrecision: Metric;
  falseMoveRate: Metric;
  preservation: Metric;
  counts: {
    removed: number;
    moved: number;
    untouched: number;
    proposedAdditions: number;
    proposedMoves: number;
  };
}

export async function scoreTaskB(
  refTopics: readonly RefTopic[],
  partial: PartialNotes,
  out: TaskBOutput,
  words: readonly Word[],
  embed: Embed,
  tau: number = SCORER.tau,
): Promise<TaskBResult> {
  const flat = flatten(refTopics);
  const removedTexts = partial.record.removed.map((i) => flat[i]!.text);
  const m = await matchPoints(
    out.additions.map((a) => ({ text: a.text, cite: a.cite })),
    removedTexts,
    words,
    embed,
    { tau },
  );
  const recovered = m.status.filter((s) => s === 'credited').length;

  const moved = new Map(partial.record.moved.map((x) => [x.id, x]));
  const untouched = new Set(partial.record.untouched.map((x) => x.id));
  const seen = new Set<string>();
  let correct = 0;
  let falseMoves = 0;
  for (const mv of out.moves) {
    if (seen.has(mv.id)) continue; // a repeated proposal for the same point is never credited twice
    seen.add(mv.id);
    const rec = moved.get(mv.id);
    if (rec && norm(mv.toTopic) === norm(refTopics[rec.from]!.title)) correct += 1;
    if (untouched.has(mv.id)) falseMoves += 1;
  }
  const edited = new Set<string>();
  for (const id of seen) if (untouched.has(id)) edited.add(id);
  for (const e of out.edits) if (untouched.has(e.id)) edited.add(e.id);

  const nR = partial.record.removed.length;
  const nM = partial.record.moved.length;
  const nU = partial.record.untouched.length;
  const props = out.moves.length;
  const adds = out.additions.length;
  return {
    additionsRecall: metric(recovered, nR, nR >= MIN.removed),
    additionsPrecision: metric(recovered, adds, adds >= MIN.proposedAdditions),
    movesRecall: metric(correct, nM, nM >= MIN.moved),
    movesPrecision: metric(correct, props, props >= MIN.proposedMoves),
    falseMoveRate: metric(falseMoves, nU, nU >= MIN.untouched),
    preservation: metric(nU - edited.size, nU, nU >= MIN.untouched),
    counts: {
      removed: nR,
      moved: nM,
      untouched: nU,
      proposedAdditions: adds,
      proposedMoves: props,
    },
  };
}
