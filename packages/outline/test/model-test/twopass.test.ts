import { describe, expect, it } from 'vitest';
import type { AgendaMeeting } from '../../eval/model-test/agenda.js';
import {
  decisionDiag,
  diagnose,
  generateTwoPass,
  parseSpans,
} from '../../eval/model-test/agenda-twopass.js';
import { synthMeeting } from '../../eval/model-test/agenda-synth.js';
import type { Backend } from '../../eval/model-test/backend.js';
import { CANDIDATE_SYSTEM, twoPassPromptHash } from '../../eval/model-test/prompts.js';

const M: AgendaMeeting = {
  agenda: '1. Budget\n2. Hiring',
  outline: [],
  reference: [],
  lines: [
    { speaker: 'A', text: 'Thanks for joining everyone.' },
    { speaker: 'B', text: 'The launch budget is $12,000.' },
    { speaker: 'A', text: 'Actually we agreed to cut marketing to $4,000.' },
    { speaker: 'C', text: 'We decided not to hire a designer this quarter.' },
  ],
  facts: [
    { topic: 'o1', kind: 'info', text: 'Launch budget is $12,000', value: '$12,000', line: 2 },
    { topic: 'o1', kind: 'decision', text: 'Marketing cut to $4,000', value: '$4,000', line: 3 },
    { topic: 'o2', kind: 'decision', text: 'No designer hired this quarter', line: 4 },
  ],
};

const scripted = (spans: string[], facts: unknown[]): Backend => ({
  id: 's',
  complete: async (req) =>
    JSON.stringify(
      req.system === CANDIDATE_SYSTEM
        ? { spans: spans.map((lines) => ({ lines })) }
        : {
            facts: (facts as { id: number }[]).map(({ id, ...f }) => ({
              ...f,
              span: spans[id - 1],
            })),
          },
    ),
});

describe('two-pass pipeline', () => {
  it('moves a span to the line that holds the quote, and drops it when none does', () => {
    const lines = M.lines;
    const chunk = { from: 0, to: 3 };
    expect(
      parseSpans({ spans: [{ lines: 'L1', quote: 'We decided not to hire' }] }, chunk, lines),
    ).toEqual([{ from: 4, to: 4 }]);
    expect(
      parseSpans({ spans: [{ lines: 'L2', quote: 'The launch budget' }] }, chunk, lines),
    ).toEqual([{ from: 2, to: 2 }]);
    expect(
      parseSpans({ spans: [{ lines: 'L2', quote: 'nothing like this anywhere' }] }, chunk, lines),
    ).toEqual([]);
  });
  it('parses spans: ranges, lists in one string, out-of-chunk and long spans dropped', () => {
    const chunk = { from: 0, to: 9 };
    expect(
      parseSpans({ spans: ['L2', 'L3-L4', 'L5, L7', 'L2', 'L1-L9', 'L40', 7] }, chunk),
    ).toEqual([
      { from: 2, to: 2 },
      { from: 3, to: 4 },
      { from: 5, to: 5 },
      { from: 7, to: 7 },
    ]);
    expect(parseSpans({ nope: 1 }, chunk)).toEqual([]);
  });
  it('cites the pass 1 span, drops "other", never trusts an owner field', async () => {
    const b = scripted(
      ['L1', 'L2', 'L3', 'L4'],
      [
        { id: 2, topic: 'o1', kind: 'number', text: 'Launch budget is $12,000', owner: 'B' },
        { id: 3, topic: 'o1', kind: 'decision', text: 'Marketing cut to $4,000' },
        { id: 4, topic: 'o2', kind: 'decision', text: 'No designer will be hired this quarter' },
        { id: 1, topic: 'o1', kind: 'other', text: 'Greeting' },
      ],
    );
    const g = await generateTwoPass(M, b);
    expect(g.facts.map((f) => f.cite)).toEqual([
      { from: 2, to: 2 },
      { from: 3, to: 3 },
      { from: 4, to: 4 },
    ]);
    expect(g.facts.every((f) => f.owner === undefined)).toBe(true);
    expect(g.verdicts).toEqual(['ok', 'ok', 'ok']);
    expect(g.dropped).toBe(1);
    expect(g.candidates.length).toBe(4);
  });
  it('shows which pass loses a fact', async () => {
    // pass 1 misses line 4 (decision); pass 2 mislabels line 3 as info
    const b = scripted(
      ['L2', 'L3'],
      [
        { id: 1, topic: 'o1', kind: 'info', text: 'Launch budget is $12,000' },
        { id: 2, topic: 'o1', kind: 'info', text: 'Marketing cut to $4,000' },
      ],
    );
    const g = await generateTwoPass(M, b);
    const d = diagnose(M, g);
    expect(d).toMatchObject({ located: 3, candidateHit: 2, factHit: 2, kindHit: 1, topicHit: 2 });
    expect(d.perKind.decision).toEqual({ located: 2, candidate: 1, fact: 1, kind: 0 });
  });
  it('re-anchors a fact whose number is not in its pass 1 span', async () => {
    const b = scripted(
      ['L1'],
      [{ id: 1, topic: 'o1', kind: 'decision', text: 'Marketing cut to $4,000' }],
    );
    const g = await generateTwoPass(M, b);
    expect(g.resolvedCites).toBe(1);
    expect(g.facts[0]!.resolved).toBe(true);
    const off = await generateTwoPass(M, b, { noResolve: true });
    expect(off.verdicts).toEqual(['unsupported']);
  });
  it('invented meetings carry evidence lines that hold the claim, and the hash is stable', () => {
    const s = synthMeeting(19);
    expect(s.facts.every((f) => f.line && f.line <= s.lines.length)).toBe(true);
    const dec = s.facts.find((f) => f.kind === 'decision' && f.value)!;
    expect(s.lines[dec.line! - 1]!.text).toContain(dec.value!);
    expect(twoPassPromptHash()).toMatch(/^[0-9a-f]{16}$/);
  });
  it('runs pass 1 in windows and pass 2 in batches, counting other and unanswered', async () => {
    const lines = Array.from({ length: 120 }, (_, k) => ({
      speaker: 'A',
      text: `Line number ${k + 1} here.`,
    }));
    const big: AgendaMeeting = { ...M, lines };
    let p1 = 0;
    const batches: number[] = [];
    const b: Backend = {
      id: 'w',
      complete: async (req) => {
        if (req.system === CANDIDATE_SYSTEM) {
          p1 += 1;
          const first = Number(/\[L(\d+)\]/.exec(req.user)![1]);
          return JSON.stringify({ spans: [{ lines: `L${first}` }, { lines: `L${first + 1}` }] });
        }
        const labels = [...req.user.matchAll(/^(L\d+): /gm)].map((x) => x[1]!);
        batches.push(labels.length);
        return JSON.stringify({
          facts: labels
            .slice(1)
            .map((l, k) => ({ span: l, topic: 'o1', kind: k === 0 ? 'other' : 'info', text: 'x' })),
        });
      },
    };
    const g = await generateTwoPass(big, b);
    expect(p1).toBeGreaterThan(2);
    expect(Math.max(...batches)).toBeLessThanOrEqual(12);
    expect(g.unanswered).toBe(batches.length);
    expect(g.other).toBe(batches.length);
  });
  it('explains uncredited decisions at the scorer, numbers only', async () => {
    const b = scripted(
      ['L3', 'L4'],
      [
        { id: 1, topic: 'o1', kind: 'decision', text: 'Marketing cut to $4,000' },
        { id: 2, topic: 'o1', kind: 'decision', text: 'No designer hired' },
      ],
    );
    const g = await generateTwoPass(M, b);
    const embed = async (t: string[]) => t.map(() => Float32Array.of(1));
    // pretend the original scorer credited nothing
    const d = await decisionDiag(M, g, g.verdicts, [-1, -1, -1], embed, 0.99);
    expect(d).toMatchObject({
      gold: 2,
      candidate: 2,
      keptAsDecision: 2,
      keptOk: 2,
      correctedCredited: 2,
      originalCredited: 0,
      topicRight: 1,
    });
    expect(
      d.notCredited.claimTextBelowTau +
        d.notCredited.citationNotSupported +
        d.notCredited.otherFactCheckOrAssignment,
    ).toBe(2);
    expect(d.rows.length).toBe(2);
  });
});
