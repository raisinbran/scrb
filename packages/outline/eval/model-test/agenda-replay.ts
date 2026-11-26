import { generateFacts, ratio, scoreAgenda } from './agenda.js';
import { FLAWED, GOOD, PILOT } from './agenda-fixture.js';
import type { Backend } from './backend.js';

/** Replays scripted backends through the N1 pipeline and prints the numbers. No model, no network. */
const scripted = (facts: unknown[]): Backend => ({
  id: 'scripted',
  complete: async () => JSON.stringify({ facts }),
});
const flat = PILOT.lines.slice(0, 12).map((l, i) => ({
  topic: 'o1',
  kind: 'info',
  text: l.text,
  cite: `L${i + 1}`,
}));
for (const [name, facts] of [
  ['agenda-aware faithful', GOOD],
  ['agenda-aware flawed', FLAWED],
  ['unstructured baseline', flat],
] as const) {
  const g = await generateFacts(PILOT, scripted([...facts]));
  const s = scoreAgenda(PILOT.facts, g.facts, g.verdicts);
  console.log(
    name,
    JSON.stringify({
      decisionRecall: ratio(s.decisionRecall),
      dateRecall: ratio(s.dateRecall),
      hallucination: ratio(s.hallucination),
      validCitations: ratio(s.validCitations),
      edit: s.editDistance,
    }),
  );
}
