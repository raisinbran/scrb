import { describe, expect, it } from 'vitest';
import { dedupe } from '../src/dedupe.js';
import type { ActionItem } from '../src/types.js';

const action = (text: string, owner: string, second: number): ActionItem => ({
  id: '',
  kind: 'action',
  text,
  owner,
  deadline: 'Not specified',
  status: 'Agreed',
  evidence: { lineIndex: second, timestampSec: second },
  alsoAt: [],
  flags: [],
  pass: 'primary',
});

// Cases a reconcile step wrongly merged or overrode (see docs/gates/gate-6-summary-recall.md).
// The pipeline must keep both items of each pair.
describe('dedupe guards: nothing real is deleted', () => {
  it('keeps related tasks of one owner apart', () => {
    const kept = dedupe([
      action('Test deployment', 'Alice', 100),
      action('Test deployment rollback', 'Alice', 200),
    ]);
    expect(kept).toHaveLength(2);
  });

  it('keeps a task apart from the same words with a negation', () => {
    const kept = dedupe([
      action('Alice will test devices that are supported', 'Alice', 100),
      action('Alice will test devices that are not supported', 'Alice', 900),
    ]);
    expect(kept).toHaveLength(2);
  });
});
