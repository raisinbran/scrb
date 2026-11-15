import { describe, expect, it } from 'vitest';
import { clausesOf, extractFacts, factCheck } from '../../eval/model-test/facts.js';
import {
  assign,
  citationSupported,
  matchPoints,
  splitPoints,
  type Word,
} from '../../eval/model-test/match.js';
import { adversarialSuite, generalSuite, split } from '../../eval/model-test/suites.js';
import {
  runAdversarial,
  runGeneral,
  generalBars,
  trigramEmbedder,
  tuneTau,
  validateAll,
} from '../../eval/model-test/validate.js';

const embed = trigramEmbedder();
const words = (text: string, speaker = 'Zed'): Word[] =>
  text.split(/\s+/).map((t) => ({ text: t, speaker }));

describe('fact extraction', () => {
  it('normalises dates written two ways to one value', () => {
    const a = extractFacts('Ship it on the 3rd of March.');
    const b = extractFacts('Ship it on March 3.');
    expect(a.values.map((v) => v.key)).toEqual(['d:2-3']);
    expect(b.values.map((v) => v.key)).toEqual(['d:2-3']);
  });

  it('reads times, durations, amounts and number words', () => {
    expect(extractFacts('Call at 3pm').values[0]!.key).toBe('t:15:00');
    expect(extractFacts('It takes two weeks').values[0]!.key).toBe('u:2-week');
    expect(extractFacts('Budget is $5,000').values[0]!.key).toBe('n:$5000');
    expect(extractFacts('Growth of 12%').values[0]!.key).toBe('n:12%');
  });

  it('does not read words that merely start like a month', () => {
    expect(extractFacts('We decided to demand a decision').values).toEqual([]);
  });

  it('finds the owner of an action, not a recipient', () => {
    expect(extractFacts('Alice will send the report to Bob.').owners).toEqual(['alice']);
    expect(extractFacts('Assigned to Carol: finish the draft.').owners).toEqual(['carol']);
    expect(extractFacts('Bob asked about the report.').owners).toEqual([]);
    expect(extractFacts('Alice and Bob will review it.').owners).toEqual(['alice', 'bob']);
  });

  it('counts negations and rejections for polarity', () => {
    expect(extractFacts('We will ship it.').positive).toBe(true);
    expect(extractFacts('We will not ship it.').positive).toBe(false);
    expect(extractFacts('The board rejected the plan.').positive).toBe(false);
    expect(extractFacts('We will not reject it.').positive).toBe(true);
  });
});

describe('role-level check', () => {
  const check = (gen: string, ref: string, span: string): string => {
    const cos = 0.9;
    return factCheck(extractFacts(gen), extractFacts(ref), clausesOf(words(span)), cos).code;
  };

  it('accepts the same facts worded differently', () => {
    expect(
      check(
        'Alice will email the report by March 3.',
        'Alice is going to email the report by the 3rd of March.',
        'Alice will email the report by March 3.',
      ),
    ).toBe('ok');
  });

  it('rejects a name that is in the span but not in the role', () => {
    expect(
      check(
        'Bob will send the file.',
        'Send the file.',
        'Alice will send the file and Bob asked to be copied.',
      ),
    ).toBe('owner-role');
  });

  it('accepts an owner the reference left out when the span gives that owner the action', () => {
    expect(
      check('Bob will send the file.', 'Send the file.', 'Bob will send the file tomorrow.'),
    ).toBe('ok');
  });

  it('rejects swapped numbers bound to different things', () => {
    expect(
      check(
        'We need 5 engineers and 3 designers.',
        'We need 3 engineers and 5 designers.',
        'We need 3 engineers and 5 designers.',
      ),
    ).toBe('value');
  });

  it('rejects a date that appears in the span only in another role', () => {
    expect(
      check(
        'Launch the beta by June 9.',
        'Launch the beta.',
        'The audit is on June 9. Launch the beta.',
      ),
    ).toBe('value-role');
  });

  it('rejects a launch date taken from an audit date in the same cited sentence', () => {
    const span = 'Launch the beta after the audit on June 9.';
    expect(check('Launch the beta on June 9.', 'Launch the beta.', span)).toBe('value-role');
    expect(
      check(
        'Review the draft on June 9.',
        'Review the draft.',
        'Review the draft before the board meeting on June 9.',
      ),
    ).toBe('value-role');
    expect(
      check(
        'Hire 12 engineers.',
        'Hire engineers.',
        'We have 12 open requests in finance, so hire engineers.',
      ),
    ).toBe('value-role');
  });

  it('accepts a date that belongs to the same action, however it is phrased', () => {
    expect(
      check('Launch the beta on June 9.', 'Launch the beta.', 'The beta launch is due June 9.'),
    ).toBe('ok');
    expect(
      check('Launch the beta by June 9.', 'Launch the beta.', 'We will launch the beta by June 9.'),
    ).toBe('ok');
    expect(
      check(
        'Finish the audit on June 9.',
        'Finish the audit.',
        'Finish the audit before the board meeting on June 9.',
      ),
    ).toBe('value-role');
    expect(
      check(
        'Hold the board meeting on June 9.',
        'Hold the board meeting.',
        'Review the draft before the board meeting on June 9.',
      ),
    ).toBe('ok');
  });
});

describe('action meaning', () => {
  const check = (gen: string, ref: string, span = ref): string =>
    factCheck(extractFacts(gen), extractFacts(ref), clausesOf(words(span)), 0.9).code;

  it('rejects opposite actions that share their nouns', () => {
    expect(check('Decrease the project budget.', 'Increase the project budget.')).toBe('action');
    expect(check('The board rejected the plan.', 'The board approved the plan.')).toBe('polarity');
    expect(check('We will stop the rollout.', 'We will start the rollout.')).toBe('action');
    expect(check('Remove the section.', 'Add the section.')).toBe('action');
    expect(check('The client declined the quote.', 'The client accepted the quote.')).toBe(
      'polarity',
    );
    expect(check('We will not extend the contract.', 'We will extend the contract.')).toBe(
      'polarity',
    );
  });

  it('accepts the same direction in other words and other tenses', () => {
    expect(
      check('The budget was raised.', 'We will increase the budget.', 'The budget was raised.'),
    ).toBe('ok');
    expect(
      check('The offer was accepted.', 'The board approved the offer.', 'The offer was accepted.'),
    ).toBe('ok');
    expect(
      check('Contractors were hired.', 'We hired contractors.', 'Contractors were hired.'),
    ).toBe('ok');
  });

  it('requires a direction the reference states, and grounds one it does not', () => {
    expect(check('Review the budget.', 'Increase the budget.', 'Review the budget.')).toBe(
      'action',
    );
    expect(check('Increase the budget.', 'Review the budget.', 'Review the budget.')).toBe(
      'action-role',
    );
    expect(
      check('Increase the budget.', 'Review the budget.', 'We will increase the budget.'),
    ).toBe('ok');
    expect(check('Increase the budget.', 'Review the budget.', 'We will increase the staff.')).toBe(
      'action-role',
    );
  });
});

describe('matching', () => {
  const span = words(
    'Alice will send the signed contract to legal by Friday. The weather was nice.',
  );
  const whole = { first: 0, last: span.length - 1 };

  it('credits one match and calls the restatement a duplicate', async () => {
    const m = await matchPoints(
      [
        { text: 'Alice will send the signed contract to legal by Friday.', cite: whole },
        { text: 'Alice is going to send the signed contract to legal by Friday.', cite: whole },
      ],
      ['Alice will send the signed contract to legal by Friday.'],
      span,
      embed,
    );
    expect(m.status.filter((s) => s === 'credited')).toHaveLength(1);
    expect(m.status.filter((s) => s === 'duplicate')).toHaveLength(1);
  });

  it('gives no credit without a supporting citation', async () => {
    const text = 'Alice will send the signed contract to legal by Friday.';
    const bad = await matchPoints([{ text, cite: null }], [text], span, embed);
    expect(bad.status).toEqual(['unsupported']);
    const outside = await matchPoints(
      [{ text, cite: { first: 12, last: 14 } }],
      [text],
      span,
      embed,
    );
    expect(outside.status).toEqual(['unsupported']);
    const impossible = await matchPoints(
      [{ text, cite: { first: 0, last: 999 } }],
      [text],
      span,
      embed,
    );
    expect(impossible.status).toEqual(['unsupported']);
  });

  it('marks a lookalike with a failed fact check as contradicted, not extra', async () => {
    const m = await matchPoints(
      [{ text: 'Alice will not send the signed contract to legal by Friday.', cite: whole }],
      ['Alice will send the signed contract to legal by Friday.'],
      span,
      embed,
    );
    expect(m.status).toEqual(['contradicted']);
  });

  it('assigns each reference point at most once, maximising total similarity', () => {
    // Greedy would give reference 0 to generated 0 (0.9) and leave generated 1 with nothing (total 0.9).
    const w = [
      [0.9, 0.8],
      [0.85, 0],
    ];
    expect(assign(w, 2, 2)).toEqual([1, 0]);
  });

  it('checks citations on the point words', () => {
    expect(citationSupported('send contract legal', { first: 0, last: 10 }, span)).toBe(true);
    expect(citationSupported('send contract legal', { first: 11, last: 13 }, span)).toBe(false);
  });

  it('splits only lines over 40 words, at sentence ends', () => {
    expect(splitPoints('- Short point.')).toEqual(['Short point.']);
    const long = `${'word '.repeat(25)}one. ${'term '.repeat(25)}two.`;
    expect(splitPoints(long)).toHaveLength(2);
  });
});

describe('invented validation suites', () => {
  it('have the required sizes and split sizes', () => {
    const g = generalSuite();
    const count = (k: string): number => g.filter((c) => c.kind === k).length;
    expect([
      count('paraphrase'),
      count('contradiction'),
      count('irrelevant'),
      count('duplicate'),
    ]).toEqual([20, 15, 15, 10]);
    const a = adversarialSuite();
    for (const k of [
      'swapped-owner',
      'swapped-number',
      'flipped-negation',
      'wrong-role',
      'wrong-date',
      'action-inversion',
      'wrong-action-date',
    ])
      expect(a.filter((c) => c.kind === k)).toHaveLength(12);
    expect(a.length).toBeGreaterThanOrEqual(84);
    const s = split(a);
    expect(s.heldOut.length).toBeGreaterThanOrEqual(42);
    for (const k of [
      'swapped-owner',
      'swapped-number',
      'flipped-negation',
      'wrong-role',
      'wrong-date',
      'action-inversion',
      'wrong-action-date',
    ])
      expect(s.heldOut.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(6);
    expect(s.tuning.length + s.heldOut.length).toBe(a.length);
    expect(s.tuning.some((c) => s.heldOut.includes(c))).toBe(false);
  });

  it('reject every adversarial pair with zero credit, and meet the general bars on the held-out half', async () => {
    const tau = await tuneTau(embed); // tuned on the tuning halves only
    const r = await validateAll(embed, tau);
    expect(r.adversarial.num).toBe(0);
    expect(r.tuningAdversarial.num).toBe(0);
    expect(r.general.failed).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('would catch a scorer that credits a wrong fact (the fact check is what rejects them)', async () => {
    // With the fact check bypassed by a tau of 0 and no fact slots, adversarial pairs score high similarity,
    // so rejection is not just a similarity effect: every adversarial pair is a candidate at the tuned tau.
    const tau = await tuneTau(embed);
    const adv = split(adversarialSuite()).heldOut;
    let candidates = 0;
    for (const c of adv) {
      const [g, r] = await embed([c.gens[0]!, c.ref]);
      let d = 0;
      for (let i = 0; i < g!.length; i += 1) d += g![i]! * r![i]!;
      if (0.5 * d + 0.5 * 0.7 >= tau) candidates += 1;
    }
    expect(candidates).toBeGreaterThan(adv.length / 2);
    const general = await runGeneral(split(generalSuite()).heldOut, embed, tau);
    expect(generalBars(general).ok).toBe(true);
    expect((await runAdversarial(adv, embed, tau)).num).toBe(0);
  });
});
