import { describe, expect, it } from 'vitest';
import {
  generateFacts,
  polarityAgrees,
  ratio,
  renderMarkdown,
  scoreAgenda,
  verify,
  wordDistance,
  type AgendaMeeting,
  type GenFact,
} from '../../eval/model-test/agenda.js';
import { manifest, parseJson } from '../../eval/model-test/run.js';
import { promptHash } from '../../eval/model-test/prompts.js';
import { reconcile, spokenToDigits } from '../../eval/model-test/reconcile.js';
import { trigramEmbedder } from '../../eval/model-test/validate.js';
import { FLAWED, GOOD, PILOT } from '../../eval/model-test/agenda-fixture.js';
import type { Backend } from '../../eval/model-test/backend.js';
import { parseOutline } from '../../src/parse.js';

const scripted = (facts: unknown[]): Backend => ({
  id: 'scripted',
  complete: async () => JSON.stringify({ facts }),
});
/** Task A shaped output (topic titles, no kinds or ids), adapted to the fact format for the baseline. */
const baseline = (m: AgendaMeeting): Backend => ({
  id: 'baseline',
  complete: async () =>
    JSON.stringify({
      facts: m.lines.slice(0, 12).map((l, i) => ({
        topic: 'o1',
        kind: 'info',
        text: l.text,
        cite: `L${i + 1}`,
      })),
    }),
});

const embed = trigramEmbedder();
async function run(b: Backend) {
  const g = await generateFacts(PILOT, b);
  return { g, s: await scoreAgenda(PILOT, g.facts, g.verdicts, embed) };
}
const gf = (
  topic: string,
  text: string,
  from: number,
  to = from,
  kind: GenFact['kind'] = 'decision',
): GenFact => ({ topic, kind, text, cite: { from, to } });

describe('agenda pilot (mock replay)', () => {
  it('parses stable ids and levels', () => {
    const r = parseOutline(PILOT.agenda);
    expect(r.items.map((i) => [i.id, i.level])).toEqual([
      ['o1', 1],
      ['o2', 2],
      ['o3', 2],
      ['o4', 1],
      ['o5', 1],
    ]);
  });
  it('a faithful model scores perfectly', async () => {
    const { s } = await run(scripted(GOOD));
    expect(ratio(s.decisionRecall)).toBe(1);
    expect(ratio(s.dateRecall)).toBe(1);
    expect(s.hallucination.num).toBe(0);
    expect(s.editDistance.norm).toBe(0);
  });
  it('catches the planted failures', async () => {
    const { g, s } = await run(scripted(FLAWED));
    expect(g.verdicts).toEqual([
      'ok',
      'unsupported',
      'ok',
      'ok',
      'ok',
      'contradicted',
      'badTopic',
      'badCite',
      'stale',
      'ok',
    ]);
    // duplicate was dropped before verification, so 10 facts remain
    expect(g.facts.length).toBe(10);
    expect(s.decisionRecall).toEqual({ num: 0, den: 3 });
    expect(s.dateRecall).toEqual({ num: 1, den: 2 });
    expect(s.hallucination.num).toBe(5);
    expect(s.editDistance.move).toBe(1);
  });
  it('agenda-aware beats an unstructured baseline', async () => {
    const a = (await run(scripted(GOOD))).s;
    const b = (await run(baseline(PILOT))).s;
    expect(ratio(b.decisionRecall)!).toBeLessThan(ratio(a.decisionRecall)!);
    expect(b.editDistance.norm).toBeGreaterThan(a.editDistance.norm);
  });
  it('renders deterministic Markdown', async () => {
    const { g } = await run(scripted(GOOD));
    const items = parseOutline(PILOT.agenda).items;
    const md = renderMarkdown(items, g.facts, true);
    expect(md).toBe(renderMarkdown(items, g.facts, true));
    expect(md).toContain('  - **Pricing**\n    - decision: Beta price is $29 a month [L3-L4]');
    expect(md).toContain('- **Proposed new topics**');
    expect(md).toContain('- **Hiring**');
    expect(renderMarkdown(items, [], true)).toContain('No discussion found');
    expect(renderMarkdown(items, [], false)).not.toContain('No discussion found');
  });
  it('reports a failed chunk instead of silently losing it', async () => {
    const g = await generateFacts(PILOT, { id: 'x', complete: async () => 'not json' });
    expect(g.failedChunks).toBe(1);
  });
  it('defect 1: an echoed or mislabeled line gets no decision credit', async () => {
    const asInfo = GOOD.map((f) => ({ ...f, kind: 'info' }));
    const g = await generateFacts(PILOT, scripted(asInfo));
    const strict = await scoreAgenda(PILOT, g.facts, g.verdicts, embed);
    const loose = await scoreAgenda(PILOT, g.facts, g.verdicts, embed, { kindStrict: false });
    expect(strict.decisionRecall).toEqual({ num: 0, den: 3 });
    expect(strict.dateRecall).toEqual({ num: 2, den: 2 });
    expect(loose.decisionRecall).toEqual({ num: 3, den: 3 });
  });
  it('defect 2/3: a well-cited wrong value is counted by the embedding match, not only by verification', async () => {
    const wrong = [
      { topic: 'o2', kind: 'decision', text: 'Beta price is $49 a month', cite: 'L2' },
    ];
    const g = await generateFacts(PILOT, scripted(wrong));
    expect(g.verdicts).toEqual(['ok']);
    const s = await scoreAgenda(PILOT, g.facts, g.verdicts, embed);
    expect(s.hallucination).toEqual({ num: 1, den: 1 });
    expect(s.decisionRecall.num).toBe(0);
  });
  it('defect 3: a value the transcript later revises is stale', () => {
    const items = parseOutline(PILOT.agenda).items;
    expect(verify(gf('o5', 'Marketing budget is $5,000', 13), items, PILOT.lines)).toBe('stale');
    expect(verify(gf('o5', 'Marketing budget cut to $4,000', 13, 14), items, PILOT.lines)).toBe(
      'ok',
    );
  });
  it('defect 4: polarity is judged per clause', () => {
    const span = 'We will not hire a designer, but we will hire an engineer.';
    expect(polarityAgrees('Hire an engineer', span)).toBe(true);
    expect(polarityAgrees('No designer will be hired', span)).toBe(true);
    expect(polarityAgrees('A designer will be hired', span)).toBe(false);
    const cont = 'We could revisit pricing after launch, but that is not decided.';
    expect(polarityAgrees('Revisiting pricing after launch is not decided', cont)).toBe(true);
  });
  it('defect 5: paraphrased repeats are dropped, a later reversal replaces the earlier fact', () => {
    const stats = { duplicates: 0, reversals: 0 };
    const dup = reconcile(
      [gf('o2', 'Beta price is $29 a month', 3, 4)],
      [gf('o2', 'The beta price is $29 per month', 3, 4)],
      stats,
    );
    expect(dup.length).toBe(1);
    expect(stats.duplicates).toBe(1);
    const rev = reconcile(
      [gf('o5', 'Marketing budget is $5,000', 13)],
      [gf('o5', 'Marketing budget cut to $4,000', 14)],
      stats,
    );
    expect(rev.map((f) => f.text)).toEqual(['Marketing budget cut to $4,000']);
    expect(rev[0]!.earlier).toEqual({ from: 13, to: 13 });
    expect(stats.reversals).toBe(1);
    const items = parseOutline(PILOT.agenda).items;
    expect(verify(rev[0]!, items, PILOT.lines)).toBe('ok');
    const other = reconcile(
      [gf('o5', 'Marketing gets $5,000', 13)],
      [gf('o5', 'Engineering gets $7,000', 13)],
    );
    expect(other.length).toBe(2);
    const flip = reconcile(
      [gf('o4', 'A designer will be hired this quarter', 9)],
      [gf('o4', 'No designer will be hired this quarter', 10)],
    );
    expect(flip.map((f) => f.text)).toEqual(['No designer will be hired this quarter']);
  });
  it('defect 5: reconciliation runs across chunks in generateFacts', async () => {
    const filler = ' pad'.repeat(3100);
    const m: AgendaMeeting = {
      agenda: '1. Budget',
      outline: [],
      reference: [],
      facts: [],
      lines: [
        { speaker: 'Ben', text: `Marketing gets $5,000 of that.${filler}` },
        { speaker: 'Ana', text: 'Actually we agreed to cut marketing to $4,000.' },
      ],
    };
    let call = 0;
    const b: Backend = {
      id: 's',
      complete: async () =>
        JSON.stringify({
          facts: [
            call++ === 0
              ? { topic: 'o1', kind: 'decision', text: 'Marketing budget is $5,000', cite: 'L1' }
              : {
                  topic: 'o1',
                  kind: 'decision',
                  text: 'Marketing budget cut to $4,000',
                  cite: 'L2',
                },
          ],
        }),
    };
    const g = await generateFacts(m, b);
    expect(g.chunks).toBe(2);
    expect(g.facts.map((f) => f.text)).toEqual(['Marketing budget cut to $4,000']);
    expect(g.facts[0]!.earlier).toEqual({ from: 1, to: 1 });
    expect(g.verdicts).toEqual(['ok']);
    expect(g.reconciled.reversals).toBe(1);
  });
  it('defect 6: word edit distance and review actions', async () => {
    expect(wordDistance(['a', 'b', 'c'], ['a', 'c', 'd'])).toBe(2);
    const good = (await run(scripted(GOOD))).s;
    expect(good.wordEdit.norm).toBe(0);
    expect(good.review).toEqual({
      accept: 11,
      reject: 0,
      move: 0,
      edit: 0,
      undo: null,
      reviewSeconds: null,
    });
    const bad = (await run(scripted(FLAWED))).s;
    expect(bad.wordEdit.norm).toBeGreaterThan(0.3);
    expect(bad.review).toMatchObject({
      accept: 4,
      reject: 5,
      move: 1,
      edit: 0,
      undo: null,
      reviewSeconds: null,
    });
  });
  it('defect 7: the manifest records a separate hash for the agenda prompt', () => {
    const mf = manifest({ id: 'b', complete: async () => '' }, 'trigram', 0.6, 1, 0);
    expect(mf.agendaPromptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(mf.agendaPromptHash).not.toBe(promptHash());
    expect(parseJson('{"facts":[]}')).toEqual({ facts: [] });
  });
  it('dates are credited by value, not by kind label', async () => {
    const asInfo = GOOD.map((f) => ({ ...f, kind: f.kind === 'date' ? 'info' : f.kind }));
    const g = await generateFacts(PILOT, scripted(asInfo));
    const s = await scoreAgenda(PILOT, g.facts, g.verdicts, embed);
    expect(s.dateRecall).toEqual({ num: 2, den: 2 });
    const decOnly = GOOD.map((f) => ({ ...f, kind: f.kind === 'decision' ? 'info' : f.kind }));
    const g2 = await generateFacts(PILOT, scripted(decOnly));
    expect((await scoreAgenda(PILOT, g2.facts, g2.verdicts, embed)).decisionRecall.num).toBe(0);
  });
  it('spoken numbers match their digits in the verifier', () => {
    expect(spokenToDigits('sold for twenty five euros')).toBe('sold for 25 euros');
    expect(spokenToDigits('profit of fifteen million')).toBe('profit of 15000000');
    expect(spokenToDigits('one of us has twelve')).toBe('one of us has 12');
    const items = parseOutline('1. Price').items;
    const lines = [{ text: 'So the remote will sell for twenty five euros.' }];
    expect(verify(gf('o1', 'The remote sells for 25 Euro', 1), items, lines)).toBe('ok');
    expect(verify(gf('o1', 'The remote sells for 35 Euro', 1), items, lines)).toBe('unsupported');
  });
  it('failures are broken down by cause', async () => {
    const g = await generateFacts(PILOT, scripted(FLAWED));
    expect(g.causes).toMatchObject({
      'number-not-in-cite': 1,
      polarity: 1,
      topic: 1,
      'cite-unparsed': 1,
      stale: 1,
    });
  });
});
