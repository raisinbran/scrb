import { rng } from './partial.js';
import type { Word } from './match.js';

/**
 * The two invented validation suites (plan section 3). All content is made up here; nothing is read from
 * any meeting. Cases are generated from frames with different fills, then split at random (fixed seed)
 * into a tuning half and a held-out half, stratified by kind so each kind is in both halves.
 */

export type GeneralKind = 'paraphrase' | 'contradiction' | 'irrelevant' | 'duplicate';
export type AdversarialKind =
  'swapped-owner' | 'swapped-number' | 'flipped-negation' | 'wrong-role' | 'wrong-date';

export interface SuiteCase<K extends string> {
  id: string;
  kind: K;
  /** The true reference point. */
  ref: string;
  /** Generated points to score; each cites the whole span. */
  gens: string[];
  /** The transcript span the generated points cite. */
  span: Word[];
}

export const SUITE_SEED = 20261116;

const speaker = (text: string, who = 'Zed'): Word[] =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => ({ text: t, speaker: who }));

const NAMES: [string, string][] = [
  ['Alice', 'Bob'],
  ['Carol', 'Dmitri'],
  ['Elena', 'Farid'],
  ['Grace', 'Hiro'],
  ['Ines', 'Jamal'],
  ['Kofi', 'Lena'],
  ['Mateo', 'Nadia'],
  ['Omar', 'Priya'],
  ['Quinn', 'Rosa'],
  ['Sven', 'Tomas'],
  ['Uma', 'Viktor'],
  ['Wanda', 'Xavier'],
];
const THINGS = [
  'vendor contract',
  'release notes',
  'onboarding guide',
  'security audit',
  'pricing page',
  'migration plan',
  'budget draft',
  'training deck',
  'status report',
  'design review',
  'test plan',
  'rollout checklist',
];
const DATES = [
  'March 3',
  'June 12',
  'Friday',
  'April 20',
  'October 8',
  'next Tuesday',
  'January 15',
  'the 9th of May',
  'Monday',
  'August 30',
  'November 2',
  'July 21',
];
const ALT_DATES = [
  'March 8',
  'June 21',
  'Thursday',
  'April 2',
  'October 18',
  'next Wednesday',
  'January 5',
  'the 19th of May',
  'Wednesday',
  'August 13',
  'November 20',
  'July 12',
];
const NUMS = [3, 5, 8, 12, 40, 250, 7, 15, 60, 90, 4, 20];
const ALT_NUMS = [30, 50, 18, 21, 4, 25, 17, 51, 6, 9, 14, 2];

const pad = (s: string): string => `Okay so ${s.charAt(0).toLowerCase()}${s.slice(1)}`;

type Frame = (i: number) => { ref: string; gen: string };

const PARAPHRASE: Frame[] = [
  (i) => ({
    ref: `${NAMES[i]![0]} will send the ${THINGS[i]} to the client by ${DATES[i]}.`,
    gen: `${NAMES[i]![0]} is going to send the client the ${THINGS[i]} by ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `The team approved a budget of ${NUMS[i]} thousand dollars for the ${THINGS[i]}.`,
    gen: `A budget of ${NUMS[i]} thousand dollars was approved for the ${THINGS[i]}.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![1]} to review the ${THINGS[i]} before ${DATES[i]}.`,
    gen: `${NAMES[i]![1]} will review the ${THINGS[i]} before ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `We decided to move the ${THINGS[i]} launch to ${DATES[i]}.`,
    gen: `The ${THINGS[i]} launch was moved to ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `The ${THINGS[i]} will take ${NUMS[i]} weeks to finish.`,
    gen: `Finishing the ${THINGS[i]} will take ${NUMS[i]} weeks.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![0]} will schedule a meeting with the vendor on ${DATES[i]}.`,
    gen: `${NAMES[i]![0]} is going to schedule the vendor meeting on ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![1]} reported ${NUMS[i]} crashes in the ${THINGS[i]}.`,
    gen: `${NUMS[i]} crashes in the ${THINGS[i]} were reported by ${NAMES[i]![1]}.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![0]} agreed to write the ${THINGS[i]} documentation.`,
    gen: `${NAMES[i]![0]} will write the documentation for the ${THINGS[i]}.`,
  }),
  (i) => ({
    ref: `The ${THINGS[i]} demo is on ${DATES[i]}.`,
    gen: `The demo of the ${THINGS[i]} takes place on ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `The group will not hire contractors for the ${THINGS[i]}.`,
    gen: `Contractors will not be hired for the ${THINGS[i]}.`,
  }),
];

const CONTRA: Frame[] = [
  (i) => ({
    ref: `The team approved the budget for the ${THINGS[i]}.`,
    gen: `The team rejected the budget for the ${THINGS[i]}.`,
  }),
  (i) => ({
    ref: `The ${THINGS[i]} will take ${NUMS[i]} weeks to finish.`,
    gen: `The ${THINGS[i]} will take ${ALT_NUMS[i]} weeks to finish.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![0]} will write the ${THINGS[i]}.`,
    gen: `${NAMES[i]![1]} will write the ${THINGS[i]}.`,
  }),
  (i) => ({
    ref: `We will ship the ${THINGS[i]} on ${DATES[i]}.`,
    gen: `We will not ship the ${THINGS[i]} on ${DATES[i]}.`,
  }),
  (i) => ({
    ref: `${NAMES[i]![1]} reported ${NUMS[i]} crashes in the ${THINGS[i]}.`,
    gen: `${NAMES[i]![1]} reported ${ALT_NUMS[i]} crashes in the ${THINGS[i]}.`,
  }),
];

const IRRELEVANT_REF: Frame[] = PARAPHRASE;

const GEN_ONLY: ((i: number) => string)[] = [
  (i) => `The office plants need water every ${NUMS[i]} days.`,
  (i) => `${NAMES[i]![0]} enjoyed the lunch menu at the new cafe.`,
  (i) => `Parking permits renew on ${ALT_DATES[i]}.`,
];

export function generalSuite(): SuiteCase<GeneralKind>[] {
  const out: SuiteCase<GeneralKind>[] = [];
  // 20 paraphrases: ten frames, two fills each.
  for (let f = 0; f < PARAPHRASE.length; f += 1)
    for (const i of [f, (f + 5) % 12]) {
      const c = PARAPHRASE[f]!(i);
      out.push({
        id: `para-${f}-${i}`,
        kind: 'paraphrase',
        ref: c.ref,
        gens: [c.gen],
        span: speaker(pad(c.gen)),
      });
    }
  // 15 contradictions: five frames, three fills each.
  for (let f = 0; f < CONTRA.length; f += 1)
    for (const i of [f, f + 4, f + 7]) {
      const c = CONTRA[f]!(i);
      out.push({
        id: `contra-${f}-${i}`,
        kind: 'contradiction',
        ref: c.ref,
        gens: [c.gen],
        span: speaker(pad(c.gen)),
      });
    }
  // 15 irrelevant: a point about something else entirely.
  for (let k = 0; k < 15; k += 1) {
    const ref = IRRELEVANT_REF[k % IRRELEVANT_REF.length]!(k % 12).ref;
    const gen = GEN_ONLY[k % GEN_ONLY.length]!((k + 3) % 12);
    out.push({ id: `irr-${k}`, kind: 'irrelevant', ref, gens: [gen], span: speaker(pad(gen)) });
  }
  // 10 duplicates: two restatements of one reference point; exactly one may be credited.
  for (let k = 0; k < 10; k += 1) {
    const c = PARAPHRASE[k]!((k + 2) % 12);
    out.push({
      id: `dup-${k}`,
      kind: 'duplicate',
      ref: c.ref,
      gens: [c.gen, c.ref],
      span: speaker(`${pad(c.gen)} ${c.ref}`),
    });
  }
  return out;
}

export function adversarialSuite(): SuiteCase<AdversarialKind>[] {
  const out: SuiteCase<AdversarialKind>[] = [];
  const add = (
    kind: AdversarialKind,
    n: number,
    ref: string,
    gen: string,
    span: string,
    who = 'Zed',
  ): void => {
    out.push({ id: `${kind}-${n}`, kind, ref, gens: [gen], span: speaker(span, who) });
  };
  for (let n = 0; n < 12; n += 1) {
    const [A, B] = NAMES[n]!;
    const t = THINGS[n]!;
    const d = DATES[n]!;
    const d2 = ALT_DATES[n]!;
    const q = NUMS[n]!;
    const q2 = ALT_NUMS[n]!;
    // swapped owners: the task goes to the other person
    const so = n % 3;
    if (so === 0)
      add(
        'swapped-owner',
        n,
        `${A} will send the ${t} to ${B}.`,
        `${B} will send the ${t} to ${A}.`,
        `${A} will send the ${t} to ${B} and ${B} said thanks.`,
      );
    else if (so === 1)
      add(
        'swapped-owner',
        n,
        `${A} will review the ${t} by ${d}.`,
        `${B} will review the ${t} by ${d}.`,
        `${A} will review the ${t} by ${d}. ${B} reviewed the earlier version.`,
      );
    else
      add(
        'swapped-owner',
        n,
        `Assigned to ${A}: finish the ${t}.`,
        `Assigned to ${B}: finish the ${t}.`,
        `The ${t} is assigned to ${A}. ${B} is on leave.`,
      );
    // swapped numbers
    const sn = n % 3;
    if (sn === 0)
      add(
        'swapped-number',
        n,
        `We need ${q} engineers and ${q2} designers for the ${t}.`,
        `We need ${q2} engineers and ${q} designers for the ${t}.`,
        `We need ${q} engineers and ${q2} designers for the ${t}.`,
      );
    else if (sn === 1)
      add(
        'swapped-number',
        n,
        `The budget is ${q}000 dollars and the headcount is ${q2}.`,
        `The budget is ${q2} dollars and the headcount is ${q}000.`,
        `The budget is ${q}000 dollars and the headcount is ${q2}.`,
      );
    else
      add(
        'swapped-number',
        n,
        `The ${t} will take ${q} weeks.`,
        `The ${t} will take ${q2} weeks.`,
        `The ${t} will take ${q} weeks.`,
      );
    // flipped negation (both directions)
    if (n % 2 === 0)
      add(
        'flipped-negation',
        n,
        `The team will not ship the ${t} before ${d}.`,
        `The team will ship the ${t} before ${d}.`,
        `The team will not ship the ${t} before ${d}.`,
      );
    else
      add(
        'flipped-negation',
        n,
        `The board approved the ${t}.`,
        `The board did not approve the ${t}.`,
        `The board approved the ${t}.`,
      );
    // right entity, wrong role: the name is in the span but is not the one who acts
    const wr = n % 3;
    if (wr === 0)
      add(
        'wrong-role',
        n,
        `Send the signed ${t} to legal.`,
        `${B} will send the signed ${t} to legal.`,
        `${A} will send the signed ${t} to legal and ${B} asked to be copied.`,
      );
    else if (wr === 1)
      add(
        'wrong-role',
        n,
        `Review the ${t} draft before ${d}.`,
        `${B} to review the ${t} draft before ${d}.`,
        `${A} will review the ${t} draft before ${d}. ${B} wrote the draft.`,
      );
    else
      add(
        'wrong-role',
        n,
        `Draft the ${t}.`,
        `${B} will draft the ${t}.`,
        `${B} asked who would draft the ${t}. ${A} will draft the ${t}.`,
      );
    // right words, wrong date
    const wd = n % 3;
    if (wd === 0)
      add(
        'wrong-date',
        n,
        `Launch the ${t} on ${d}.`,
        `Launch the ${t} on ${d2}.`,
        `Launch the ${t} on ${d}.`,
      );
    else if (wd === 1)
      add(
        'wrong-date',
        n,
        `The ${t} review meeting is at 3pm.`,
        `The ${t} review meeting is at 5pm.`,
        `The ${t} review meeting is at 3pm.`,
      );
    else
      add(
        'wrong-date',
        n,
        `The ${t} is due ${d}.`,
        `The ${t} is due ${d2}.`,
        `The ${t} is due ${d}. The audit is on ${d2}.`,
      );
  }
  return out;
}

/** Random split into a tuning and a held-out half, stratified by kind. */
export function split<K extends string>(
  cases: SuiteCase<K>[],
  seed: number = SUITE_SEED,
): { tuning: SuiteCase<K>[]; heldOut: SuiteCase<K>[] } {
  const rand = rng(seed);
  const kinds = [...new Set(cases.map((c) => c.kind))];
  const tuning: SuiteCase<K>[] = [];
  const heldOut: SuiteCase<K>[] = [];
  for (const k of kinds) {
    const xs = cases.filter((c) => c.kind === k);
    for (let i = xs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [xs[i], xs[j]] = [xs[j]!, xs[i]!];
    }
    const h = Math.floor(xs.length / 2);
    tuning.push(...xs.slice(0, h));
    heldOut.push(...xs.slice(h));
  }
  return { tuning, heldOut };
}
