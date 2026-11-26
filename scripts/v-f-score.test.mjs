import assert from 'node:assert/strict';
import { test } from 'vitest';
import { prepareReferences, scoreSlots } from './research/v-f-score.mjs';

const xml = (start, end) => ({
  xml: `<segment transcriber_start="${start}" transcriber_end="${end}" />`,
});

test('rejects a second voice between the sustained and eligibility floors', () => {
  assert.throws(() => prepareReferences([xml(0, 15), xml(15, 24)], 0), /at least 15/);
});

test('rejects missing, empty, nonfinite and reversed annotation times', () => {
  for (const invalid of [{ xml: '<segment />' }, xml('', 20), xml('NaN', 20), xml(20, 19)]) {
    assert.throws(() => prepareReferences([invalid], 0), /annotation/);
  }
});

test('excludes overlapping reference ticks from scoring and preserves eligibility totals', () => {
  const reference = prepareReferences([xml(0, 20), xml(15, 35)], 0);
  assert.deepEqual(reference.totals, [2000, 2000]);
  assert.deepEqual(reference.exclusive, [1500, 1500]);
  assert.equal(reference.overlapTicks, 500);
});

test('distinguishes dominant speakers while rejecting fallback, ties and shared IDs', () => {
  const reference = prepareReferences([xml(0, 20), xml(20, 40)], 0);
  const slots = (getId) =>
    Array.from({ length: 600 }, (_, i) => ({ id: getId(i), label: 'Speaker ?' }));
  const fallback = scoreSlots(
    reference,
    slots(() => 'meeting'),
  );
  assert.equal(fallback.separated, 0);
  assert.deepEqual(
    fallback.voices.map(({ unassigned }) => unassigned),
    [20, 20],
  );
  assert.equal(
    scoreSlots(
      reference,
      slots((i) => (i < 100 ? '1' : i < 200 ? '2' : '3')),
    ).separated,
    0,
  );
  assert.equal(
    scoreSlots(
      reference,
      slots(() => '1'),
    ).separated,
    0,
  );
  assert.equal(
    scoreSlots(
      reference,
      slots((i) => (i < 200 ? '1' : '2')),
    ).separated,
    1,
  );
});
