import { describe, expect, it } from 'vitest';
import { reconcileItems } from '../src/reconcile.js';
import type { ActionItem, DecisionItem } from '../src/types.js';

const decision = (
  text: string,
  second: number,
  status: DecisionItem['status'] = 'Decided',
): DecisionItem => ({
  id: '',
  kind: 'decision',
  text,
  status,
  impactArea: 'Scope',
  evidence: { lineIndex: second, timestampSec: second },
  alsoAt: [],
  flags: [],
  pass: 'primary',
});

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

describe('reconcileItems', () => {
  it('merges a paraphrase raised a few minutes later and keeps both lines reachable', () => {
    const kept = reconcileItems(
      [
        decision('The remote will have a speech recognition chip', 100),
        decision('Speech recognition chip is included in the remote', 220, 'Tentatively agreed'),
      ],
      10,
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]!.alsoAt).toHaveLength(1);
  });

  it('keeps the same task for two owners and distant repeats apart', () => {
    expect(
      reconcileItems(
        [
          action('Prepare the prototype slides', 'B', 100),
          action('Prepare the prototype slides', 'C', 110),
        ],
        10,
      ),
    ).toHaveLength(2);
    expect(
      reconcileItems(
        [
          decision('The remote will have a speech recognition chip', 100),
          decision('The remote will have a speech recognition chip', 2000),
        ],
        50,
      ),
    ).toHaveLength(2);
  });

  it('drops an earlier decision that a later one reverses, and keeps the later link to it', () => {
    const early = decision('The remote will include an LCD screen for channel display', 100);
    const late = decision('The remote will not include an LCD screen for channel display', 900);
    const kept = reconcileItems([early, late], 20);
    expect(kept).toEqual([late]);
    expect(late.alsoAt).toEqual([early.evidence]);
  });

  it('keeps a reversal that comes before the item (the later one stands)', () => {
    const early = decision('The remote will not include an LCD screen for channel display', 100);
    const late = decision('The remote will include an LCD screen for channel display', 900);
    expect(reconcileItems([early, late], 20)).toEqual([late]);
  });

  it("does not let another person declining a task remove the earlier owner's action", () => {
    const alice = action('Prepare the prototype presentation slides', 'Alice', 100);
    const bob = action('Will not prepare the prototype presentation slides', 'Bob', 900);
    expect(reconcileItems([alice, bob], 20)).toEqual([alice, bob]);
  });

  it('still drops an action its own owner takes back later', () => {
    const first = action('Alice will prepare the prototype presentation slides', 'Alice', 100);
    const back = action('Alice will not prepare the prototype presentation slides', 'Alice', 900);
    expect(reconcileItems([first, back], 20)).toEqual([back]);
  });

  it('does not treat a different verb by the same owner as taking the task back', () => {
    const prepare = action(
      'Alice will prepare the prototype presentation slides for Monday',
      'Alice',
      100,
    );
    const review = action(
      'Alice will not review the prototype presentation slides for Monday',
      'Alice',
      900,
    );
    expect(reconcileItems([prepare, review], 20)).toEqual([prepare, review]);
  });

  it('removes nothing for a negation about a different matter', () => {
    const a = decision('The remote will include an LCD screen for channel display', 100);
    const b = decision('The remote will not include a speech recognition chip', 900);
    expect(reconcileItems([a, b], 20)).toEqual([a, b]);
  });

  it('does not treat two quick opposite statements as an override', () => {
    const items = [
      decision('The remote will include an LCD screen for channel display', 100),
      decision('The remote will not include an LCD screen for channel display', 120),
    ];
    expect(reconcileItems(items, 20)).toHaveLength(2);
  });

  it('applies no cap by default and a stated cap keeps the best supported items in order', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      decision(`Unique topic number${i} alpha${i} beta${i}`, i * 60),
    );
    expect(reconcileItems(items, 30)).toHaveLength(30);
    items[7]!.alsoAt.push({ lineIndex: 1, timestampSec: 1 });
    const capped = reconcileItems(items, 30, { itemsPerMinute: 0.2, minCap: 1 });
    expect(capped).toHaveLength(6);
    expect(capped).toContain(items[7]);
    expect(capped.map((i) => i.evidence.timestampSec)).toEqual(
      [...capped.map((i) => i.evidence.timestampSec)].sort((a, b) => a - b),
    );
  });
});
