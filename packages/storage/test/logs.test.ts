import { mkdtemp, readFile } from 'node:fs/promises';
import { WorkerProcess, WorkerFailed } from '../../transcription/src/worker.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logger, errorFields } from '../src/logs.ts';

describe('logger privacy at worker failure boundaries', () => {
  it('removes invented transcript content from stdout, stderr, error names and messages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scrb-private-log-'));
    const logger = new Logger(dir, () => new Date('2026-10-31T12:00:00Z'));
    const leaked = 'ImaginaryClientNectar';
    const workerError = Object.assign(new Error(leaked), { name: leaked, code: leaked });
    logger.log('error', 'worker-failed', {
      stdout: leaked,
      stderr: leaked,
      workerOutput: leaked,
      workerMessage: leaked,
      ...errorFields(workerError),
    });
    await logger.flush();
    const file = await readFile(join(dir, 'scrb-2026-10-31.log'), 'utf8');
    expect(file).not.toContain(leaked);
    const entry = JSON.parse(file) as Record<string, unknown>;
    expect(entry).toMatchObject({
      stdout: '[redacted]',
      stderr: '[redacted]',
      workerOutput: '[redacted]',
      workerMessage: '[redacted]',
      error: 'Error',
      code: 'unknown',
    });
  });

  it('retains safe diagnostic type and known OS error codes without error messages', () => {
    expect(
      errorFields(
        Object.assign(new Error('Invented private transcript'), {
          name: 'StorageError',
          code: 'EACCES',
        }),
      ),
    ).toEqual({ error: 'StorageError', code: 'EACCES' });
    expect(errorFields(null)).toEqual({ error: 'Error', code: 'unknown' });
  });

  it('does not persist private native-worker stderr, stdout, or spawn errors', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scrb-worker-log-'));
    const privateWords = 'ImaginaryClientNectarSecretPhrase';
    const worker = new WorkerProcess({
      name: 'invented-worker',
      command: process.execPath,
      args: ['-e', `process.stdout.write("${privateWords}"); process.stderr.write("${privateWords}"); process.exit(4)`],
      background: false,
    });
    const stdout: Buffer[] = [];
    worker.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    const exit = await worker.done;
    expect(exit.code).toBe(4);
    expect(exit.stderrTail).toContain(privateWords);
    expect(Buffer.concat(stdout).toString()).toContain(privateWords);
    const logger = new Logger(dir, () => new Date('2026-10-31T12:00:00Z'));
    logger.log('error', 'native-worker-failed', {
      ...errorFields(new WorkerFailed('invented-worker', exit)),
      stderr: exit.stderrTail,
      stdout: Buffer.concat(stdout).toString(),
      spawnError: exit.spawnError,
    });
    await logger.flush();
    const saved = await readFile(join(dir, 'scrb-2026-10-31.log'), 'utf8');
    expect(saved).not.toContain(privateWords);
    expect(saved).toContain('[redacted]');
  });

});
