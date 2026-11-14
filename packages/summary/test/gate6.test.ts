import { describe, expect, it } from 'vitest';
import { linkProblem, secondaryProblem } from '../eval/gate6.js';
import type { ActionItem } from '../src/types.js';

const transcript = {
  lines: [
    { startSec: 0, speaker: 'A', text: 'Welcome everyone.' },
    { startSec: 10, speaker: 'B', text: 'I will send the budget estimate to Priya by Friday.' },
    { startSec: 20, speaker: 'A', text: 'Great, thanks.' },
  ],
};
const item = (lineIndex: number, timestampSec: number, text: string): ActionItem => ({
  id: 'a1',
  kind: 'action',
  text,
  evidence: { lineIndex, timestampSec },
  alsoAt: [],
  flags: [],
  pass: 't',
  owner: 'B',
  deadline: 'Friday',
  status: 'Agreed',
});

describe('gate6 link check', () => {
  it('accepts a supported link', () => {
    expect(linkProblem(item(1, 10, 'Send the budget estimate to Priya'), transcript)).toBeNull();
  });
  it('rejects a missing line, a wrong time and unsupported words', () => {
    expect(linkProblem(item(9, 10, 'Send the budget estimate'), transcript)).toBe('line missing');
    expect(linkProblem(item(1, 11, 'Send the budget estimate'), transcript)).toBe(
      'time differs from line',
    );
    expect(linkProblem(item(0, 0, 'Book the venue for the offsite'), transcript)).toBe(
      'words not found nearby',
    );
  });
});

describe('gate6 secondary link check', () => {
  it('accepts a real alsoAt link and rejects a missing line or wrong time', () => {
    expect(secondaryProblem({ lineIndex: 2, timestampSec: 20 }, transcript)).toBeNull();
    expect(secondaryProblem({ lineIndex: 7, timestampSec: 20 }, transcript)).toBe('line missing');
    expect(secondaryProblem({ lineIndex: 2, timestampSec: 99 }, transcript)).toBe(
      'time differs from line',
    );
  });
});
