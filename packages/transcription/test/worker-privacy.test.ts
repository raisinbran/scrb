import { describe, expect, it } from 'vitest';
import { WorkerFailed, WorkerProcess, describeExit } from '../src/worker.js';

describe('native worker output privacy', () => {
  it('keeps invented stderr out of public failure descriptions', async () => {
    const inventedText = 'FictionalClientWaterfall';
    const worker = new WorkerProcess({
      name: 'fixture-worker',
      command: process.execPath,
      args: ['-e', `console.error("${inventedText}"); process.exit(3)`],
      background: false,
    });
    worker.stdout.resume();
    const exit = await worker.done;
    const failure = new WorkerFailed('fixture-worker', exit);
    expect(exit.stderrTail).toContain(inventedText);
    expect(failure.message).not.toContain(inventedText);
    expect(describeExit(exit)).not.toContain(inventedText);
  });
});
