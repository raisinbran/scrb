// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { LargeModelGate } from './large-model-gate.ts';

describe('one large model shared by final pass, import and summary', () => {
  it.each([
    ['final pass', 'import'],
    ['final pass', 'summary'],
    ['import', 'summary'],
  ])('serializes %s and %s without a second model running', async (first, second) => {
    const gate = new LargeModelGate();
    const order: string[] = [];
    let finish!: () => void;
    const firstWork = gate.run(async () => {
      order.push(first + ':start');
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      order.push(first + ':end');
    });
    const secondWork = gate.run(async () => {
      order.push(second + ':start');
      order.push(second + ':end');
    });
    expect(order).toEqual([first + ':start']);
    finish();
    await Promise.all([firstWork, secondWork]);
    expect(order).toEqual([first + ':start', first + ':end', second + ':start', second + ':end']);
  });

  it('cancels a waiting summary immediately while another worker runs', async () => {
    const gate = new LargeModelGate();
    let finish!: () => void;
    const runningImport = gate.run(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const controller = new AbortController();
    const summary = vi.fn(async () => undefined);
    const queued = gate.run(summary, controller.signal);
    controller.abort();
    await expect(queued).rejects.toThrow('cancelled');
    expect(summary).not.toHaveBeenCalled();
    finish();
    await runningImport;
    await gate.run(async () => undefined);
  });
});
