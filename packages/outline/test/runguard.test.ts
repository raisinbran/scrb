import { describe, expect, it } from 'vitest';
import { SortGuard } from '../src/runguard.js';

describe('SortGuard', () => {
  it('commits the latest run at an unchanged revision', () => {
    const g = new SortGuard();
    expect(g.canCommit(g.start(3), 3)).toBe(true);
  });
  it('drops a cancelled run that finishes late', () => {
    const g = new SortGuard();
    const run = g.start(3);
    g.cancel();
    expect(g.canCommit(run, 3)).toBe(false);
  });
  it('drops a superseded run', () => {
    const g = new SortGuard();
    const old = g.start(3);
    const fresh = g.start(3);
    expect(g.canCommit(old, 3)).toBe(false);
    expect(g.canCommit(fresh, 3)).toBe(true);
  });
  it('drops a run whose revision moved on (a pin made while sorting)', () => {
    const g = new SortGuard();
    const run = g.start(3);
    expect(g.canCommit(run, 4)).toBe(false);
  });
});
