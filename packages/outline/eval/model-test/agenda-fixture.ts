import type { AgendaMeeting } from './agenda.js';

/** Invented meeting for the N1 pilot. No real names, agendas or notes. */
export const PILOT: AgendaMeeting = {
  agenda: ['1. Launch plan', '  a. Pricing', '  b. Beta date', '2. Hiring', '3. Budget'].join('\n'),
  outline: [],
  reference: [],
  lines: [
    ['Ana', "Let's start with the launch plan. Pricing first."],
    ['Ben', 'I propose $49 a month for the team plan.'],
    ['Ana', "That is too high for beta users, I'd say $29 a month."],
    ['Ben', 'Fine, we agree on $29 a month for the beta.'],
    ['Ana', 'We could revisit pricing after launch, but that is not decided.'],
    ['Cy', 'The beta opens on March 3rd if the build is signed off.'],
    ['Ben', 'The signing certificate might not arrive in time, which is a risk.'],
    ['Ana', 'Cy will confirm the certificate status by Friday.'],
    ['Ana', 'Moving to hiring. We have two open roles.'],
    ['Cy', 'We decided not to hire a designer this quarter.'],
    ['Ben', 'Who will review the contractor proposals?'],
    ['Ana', 'Budget now. The launch budget is $12,000.'],
    ['Ben', 'Marketing gets $5,000 of that.'],
    ['Ana', 'Actually we agreed to cut marketing to $4,000.'],
    ['Cy', 'We should also discuss the office move, which is not on the agenda.'],
    ['Ana', 'The office move is planned for June.'],
  ].map(([speaker, text]) => ({ speaker: speaker!, text: text! })),
  facts: [
    { topic: 'o2', kind: 'decision', text: 'Beta price is $29 a month', value: '$29' },
    { topic: 'o2', kind: 'caveat', text: 'Revisiting pricing after launch is not decided' },
    {
      topic: 'o3',
      kind: 'date',
      text: 'Beta opens March 3rd if the build is signed off',
      value: 'March 3rd',
    },
    { topic: 'o3', kind: 'caveat', text: 'Signing certificate might not arrive in time' },
    {
      topic: 'o3',
      kind: 'action',
      text: 'Confirm certificate status by Friday',
      owner: 'Cy',
      value: 'Friday',
    },
    { topic: 'o4', kind: 'info', text: 'Two open roles' },
    { topic: 'o4', kind: 'decision', text: 'No designer will be hired this quarter' },
    { topic: 'o4', kind: 'question', text: 'Who reviews the contractor proposals' },
    { topic: 'o5', kind: 'info', text: 'Launch budget is $12,000', value: '$12,000' },
    { topic: 'o5', kind: 'decision', text: 'Marketing budget cut to $4,000', value: '$4,000' },
    { topic: 'Office move', kind: 'date', text: 'Office move is planned for June', value: 'June' },
  ],
};

const F = (topic: string, kind: string, text: string, cite: string, extra: object = {}) => ({
  topic,
  kind,
  text,
  cite,
  ...extra,
});

/** What a faithful model would return. */
export const GOOD = [
  F('o2', 'decision', 'Beta price is $29 a month', 'L3-L4'),
  F('o2', 'caveat', 'Revisiting pricing after launch is not decided', 'L5'),
  F('o3', 'date', 'Beta opens March 3rd if the build is signed off', 'L6'),
  F('o3', 'caveat', 'Signing certificate might not arrive in time', 'L7'),
  F('o3', 'action', 'Confirm certificate status by Friday', 'L8', { owner: 'Cy' }),
  F('o4', 'info', 'Two open roles', 'L9'),
  F('o4', 'decision', 'No designer will be hired this quarter', 'L10'),
  F('o4', 'question', 'Who reviews the contractor proposals', 'L11'),
  F('o5', 'info', 'Launch budget is $12,000', 'L12'),
  F('o5', 'decision', 'Marketing budget cut to $4,000', 'L13-L14'),
  F('new', 'date', 'Office move is planned for June', 'L16', { newTopic: 'Office move' }),
];

/** A model with the failure modes the scorer must catch. */
export const FLAWED = [
  GOOD[1]!, // decision on price dropped
  F('o3', 'date', 'Beta opens March 5th', 'L6'), // invented date
  GOOD[3]!,
  F('o2', 'action', 'Confirm certificate status by Friday', 'L8', { owner: 'Cy' }), // wrong topic
  GOOD[5]!,
  F('o4', 'decision', 'A designer will be hired this quarter', 'L10'), // polarity flip
  F('o99', 'info', 'Something about parking', 'L9'), // invented topic id
  F('o5', 'info', 'Launch budget is $12,000', 'L40'), // citation out of range
  F('o5', 'decision', 'Marketing budget is $5,000', 'L13'), // stale, superseded value
  GOOD[5]!, // duplicate of the open-roles fact
  GOOD[10]!,
];
