import { describe, expect, it } from 'vitest';
import { WorkerFailed, WorkerProcess, describeExit, runToCompletion } from '../src/worker.js';

const node = process.execPath;
const script = (body: string): string[] => ['-e', body];

describe('WorkerProcess', () => {
  it('collects stdout from a tool that succeeds', async () => {
    const out = await runToCompletion({
      name: 'echo', command: node, args: script('console.log("hello")'),
    });
    expect(out.trim()).toBe('hello');
  });

  it('kills a hung tool and reports it as stopped', async () => {
    const worker = new WorkerProcess({
      name: 'hang', command: node, args: script('setInterval(() => {}, 1000)'),
    });
    worker.kill();
    const exit = await worker.done;
    expect(exit.killed).toBe(true);
    expect(describeExit(exit)).toBe('was stopped');
  });

  it('stops on the abort signal', async () => {
    const stop = new AbortController();
    const worker = new WorkerProcess({
      name: 'hang', command: node, args: script('setInterval(() => {}, 1000)'), signal: stop.signal,
    });
    setTimeout(() => stop.abort(), 50);
    expect((await worker.done).killed).toBe(true);
  });

  it('enforces the timeout', async () => {
    const worker = new WorkerProcess({
      name: 'hang', command: node, args: script('setInterval(() => {}, 1000)'), timeoutMs: 100,
    });
    expect((await worker.done).timedOut).toBe(true);
  });

  it('reports a crash with the tail of stderr', async () => {
    await expect(
      runToCompletion({
        name: 'bad', command: node, args: script('console.error("boom"); process.exit(3)'),
      }),
    ).rejects.toSatisfy(
      (e) => e instanceof WorkerFailed && e.exit.code === 3 && e.exit.stderrTail.includes("boom"),
    );
  });

  it('reports a missing binary instead of throwing out of band', async () => {
    const exit = await new WorkerProcess({ name: 'x', command: '/no/such/tool', args: [] }).done;
    expect(exit.spawnError).toBeDefined();
    expect(describeExit(exit)).toContain('could not start');
  });

  it('runs at background priority by default', async () => {
    const out = await runToCompletion({
      name: 'nice',
      command: node,
      args: script(
        'setTimeout(() => console.log(require("os").getPriority()), 100)',
      ),
    });
    expect(Number(out)).toBeGreaterThan(0);
  });
});
