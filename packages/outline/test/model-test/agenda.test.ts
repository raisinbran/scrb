import { describe, expect, it } from 'vitest';
import {
  generateFacts,
  ratio,
  renderMarkdown,
  scoreAgenda,
  type AgendaMeeting,
} from '../../eval/model-test/agenda.js';
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

async function run(b: Backend) {
  const g = await generateFacts(PILOT, b);
  return { g, s: scoreAgenda(PILOT.facts, g.facts, g.verdicts) };
}

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
      'ok',
      'ok',
    ]);
    // duplicate was dropped before verification, so 10 facts remain
    expect(g.facts.length).toBe(10);
    expect(s.decisionRecall).toEqual({ num: 0, den: 3 });
    expect(s.dateRecall).toEqual({ num: 1, den: 2 });
    expect(s.hallucination.num).toBe(4);
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
});
