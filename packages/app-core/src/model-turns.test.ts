import { describe, expect, it } from 'vitest';
import { ModelTurns } from './model-turns.ts';

function job(log: string[], name: string, gate: Promise<void> = Promise.resolve()) {
  return async (): Promise<void> => {
    log.push(`${name} start`);
    await gate;
    log.push(`${name} end`);
  };
}

describe('ModelTurns', () => {
  it('runs one job at a time, in order', async () => {
    const turns = new ModelTurns();
    const log: string[] = [];
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const run = turns.wrap((input: { signal: AbortSignal; work: () => Promise<void> }) =>
      input.work(),
    );
    const { signal } = new AbortController();
    const first = run({ signal, work: job(log, 'a', gate) });
    const second = run({ signal, work: job(log, 'b') });
    await Promise.resolve();
    open();
    await Promise.all([first, second]);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('frees a cancelled waiter at once, without letting the next job overlap', async () => {
    const turns = new ModelTurns();
    const log: string[] = [];
    let open = (): void => undefined;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const run = turns.wrap((input: { signal: AbortSignal; work: () => Promise<void> }) =>
      input.work(),
    );
    const { signal } = new AbortController();
    const cancelled = new AbortController();
    const first = run({ signal, work: job(log, 'a', gate) });
    const waiting = run({ signal: cancelled.signal, work: job(log, 'b') });
    const third = run({ signal, work: job(log, 'c') });
    cancelled.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(log).toEqual(['a start']);
    open();
    await Promise.all([first, third]);
    expect(log).toEqual(['a start', 'a end', 'c start', 'c end']);
  });
});
