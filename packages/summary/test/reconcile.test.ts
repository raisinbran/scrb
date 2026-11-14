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
  it('drops an earlier action that a later one reverses, and keeps the later link to it', () => {
    const early = action('The remote will include an LCD screen for channel display', 'Alice', 100);
    const late = action(
      'The remote will not include an LCD screen for channel display',
      'Alice',
      900,
    );
    const kept = reconcileItems([early, late], 20);
    expect(kept).toEqual([late]);
    expect(late.alsoAt).toEqual([early.evidence]);
  });

  it('keeps a reversal that comes before the item (the later one stands)', () => {
    const early = action(
      'The remote will not include an LCD screen for channel display',
      'Alice',
      100,
    );
    const late = action('The remote will include an LCD screen for channel display', 'Alice', 900);
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

  it('does not treat a different object as taking the task back', () => {
    const proto = action(
      'Alice will prepare the prototype presentation slides for Monday',
      'Alice',
      100,
    );
    const budget = action(
      'Alice will not prepare the budget presentation slides for Monday',
      'Alice',
      900,
    );
    expect(reconcileItems([proto, budget], 20)).toEqual([proto, budget]);
  });

  it('does not treat a different due date or qualifier as taking the task back', () => {
    const monday = action(
      'Alice will prepare the prototype presentation slides for Monday',
      'Alice',
      100,
    );
    const friday = action(
      'Alice will not prepare the prototype presentation slides for Friday',
      'Alice',
      900,
    );
    expect(reconcileItems([monday, friday], 20)).toEqual([monday, friday]);
    const plain = action('Alice will not prepare the prototype presentation slides', 'Alice', 900);
    expect(reconcileItems([monday, plain], 20)).toEqual([monday, plain]);
  });

  it('does not treat swapped word order as taking the task back', () => {
    const first = action('The team will launch Alpha before Beta.', 'Alice', 100);
    const swapped = action('The team will not launch Beta before Alpha.', 'Alice', 900);
    expect(reconcileItems([first, swapped], 20)).toEqual([first, swapped]);
  });

  it('drops an action that a later one reverses in identical wording', () => {
    const first = action('The team will launch Alpha before Beta.', 'Alice', 100);
    const back = action('The team will not launch Alpha before Beta.', 'Alice', 900);
    expect(reconcileItems([first, back], 20)).toEqual([back]);
  });

  it('keeps both of two related tasks for the same owner, with no merging', () => {
    const test = action('Test deployment', 'Alice', 100);
    const rollback = action('Test deployment rollback', 'Alice', 200);
    expect(reconcileItems([test, rollback], 20)).toEqual([test, rollback]);
    const ios = action('Alice will ship the iOS build for review', 'Alice', 100);
    const android = action('Alice will ship the Android build for review', 'Alice', 160);
    expect(reconcileItems([ios, android], 20)).toEqual([ios, android]);
  });

  it('never overrides when neither item has a named owner', () => {
    const first = decision('The team will launch Alpha before Beta.', 100);
    const back = decision('The team will not launch Alpha before Beta.', 900);
    expect(reconcileItems([first, back], 20)).toEqual([first, back]);
    const a = action('Prepare the prototype slides', 'Not specified', 100);
    const b = action('Not prepare the prototype slides', 'Not specified', 900);
    expect(reconcileItems([a, b], 20)).toEqual([a, b]);
  });

  it('does not read a hyphenated compound such as no-show as a negation', () => {
    const show = action('Alice will track the show list for the event', 'Alice', 100);
    const noShow = action('Alice will track the no-show list for the event', 'Alice', 900);
    expect(reconcileItems([show, noShow], 20)).toEqual([show, noShow]);
  });

  it('does not read ordinary verbs such as remove or drop as a negation', () => {
    const keep = action('Alice will update the login page for the release', 'Alice', 100);
    const drop = action('Alice will drop update the login page for the release', 'Alice', 900);
    expect(reconcileItems([keep, drop], 20)).toEqual([keep, drop]);
  });

  it("treats a contraction such as won't as a reversal by the same owner", () => {
    const first = action('Alice will prepare the prototype slides for Monday', 'Alice', 100);
    const back = action("Alice won't prepare the prototype slides for Monday", 'Alice', 900);
    expect(reconcileItems([first, back], 20)).toEqual([back]);
  });

  it('removes nothing for a negation about a different matter', () => {
    const a = decision('The remote will include an LCD screen for channel display', 100);
    const b = decision('The remote will not include a speech recognition chip', 900);
    expect(reconcileItems([a, b], 20)).toEqual([a, b]);
  });

  it('does not treat two quick opposite statements as an override', () => {
    const items = [
      action('Alice will include an LCD screen for channel display', 'Alice', 100),
      action('Alice will not include an LCD screen for channel display', 'Alice', 120),
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
