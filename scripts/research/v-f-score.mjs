import assert from 'node:assert/strict';

const ticksPerSecond = 100;
const ticksPerSlot = 10;

export function prepareReferences(annotations, start, duration = 60) {
  const intervals = annotations.map(({ xml }) =>
    [...xml.matchAll(/<segment\b[^>]*>/g)].map(([tag]) => {
      const time = (name) => {
        const value = tag.match(new RegExp('\\b' + name + '="([^"]*)"'))?.[1];
        assert(value?.trim(), 'missing annotation time');
        const seconds = Number(value);
        assert(Number.isFinite(seconds) && seconds >= 0, 'invalid annotation time');
        return seconds;
      };
      const from = time('transcriber_start');
      const to = time('transcriber_end');
      assert(to > from, 'invalid annotation interval');
      return [from, to];
    }),
  );
  const totals = intervals.map(() => 0);
  const exclusive = intervals.map(() => 0);
  const activeReference = [];
  let overlapTicks = 0;
  for (let tick = 0; tick < duration * ticksPerSecond; tick++) {
    const time = start + (tick + 0.5) / ticksPerSecond;
    const active = [];
    intervals.forEach((turns, i) => {
      if (turns.some(([from, to]) => from <= time && time < to)) {
        totals[i]++;
        active.push(i);
      }
    });
    if (active.length > 1) overlapTicks++;
    if (active.length === 1) exclusive[active[0]]++;
    activeReference.push(active.length === 1 ? active[0] : -1);
  }
  const sustained = totals.flatMap((ticks, i) => (ticks >= 500 ? [i] : []));
  assert.equal(sustained.length, 2, 'expected exactly two references with at least 5 seconds');
  assert(
    sustained.every((i) => totals[i] >= 1500),
    'both references must have at least 15 seconds',
  );
  return { activeReference, sustained, totals, exclusive, overlapTicks };
}

export function scoreSlots(reference, labels, aliases = new Map()) {
  const { activeReference, sustained } = reference;
  assert.equal(labels.length * ticksPerSlot, activeReference.length);
  const resolve = (id) => {
    while (aliases.has(id)) id = aliases.get(id);
    return id;
  };
  const scored = reference.totals.map(() => new Map());
  activeReference.forEach((index, tick) => {
    if (index < 0) return;
    const counts = scored[index];
    const id = resolve(labels[Math.floor(tick / ticksPerSlot)].id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const voices = sustained.map((index) => {
    const counts = scored[index];
    const seconds = reference.exclusive[index] / ticksPerSecond;
    const unassigned = (counts.get('meeting') ?? 0) / ticksPerSecond;
    counts.delete('meeting');
    const ranked = [...counts].sort((a, b) => b[1] - a[1]);
    const [id, ticks] = ranked[0] ?? ['', 0];
    return {
      id: ranked[1]?.[1] === ticks ? '' : id,
      seconds,
      dominant: ticks / ticksPerSecond,
      unassigned,
    };
  });
  const separated = Number(
    voices[0].id !== voices[1].id &&
      voices.every(({ id, seconds, dominant }) => id && dominant >= Math.max(1, seconds * 0.25)),
  );
  const assigned = labels.filter(({ id }) => id !== 'meeting');
  return {
    separated,
    ids: new Set(assigned.map(({ id }) => resolve(id))).size,
    observedPromotedIds: new Set(
      assigned.filter(({ label }) => /^Speaker [0-9]+$/.test(label)).map(({ id }) => resolve(id)),
    ).size,
    voices: voices.map(({ seconds, dominant, unassigned }) => ({ seconds, dominant, unassigned })),
  };
}
