import { mkdtemp, readFile } from 'node:fs/promises';
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
      stdout: '[redacted]', stderr: '[redacted]',
      workerOutput: '[redacted]', workerMessage: '[redacted]',
      error: 'Error', code: 'unknown',
    });
  });

  it('retains safe diagnostic type and known OS error codes without error messages', () => {
    expect(errorFields(Object.assign(new Error('Invented private transcript'), {
      name: 'StorageError', code: 'EACCES',
    }))).toEqual({ error: 'StorageError', code: 'EACCES' });
    expect(errorFields(null)).toEqual({ error: 'Error', code: 'unknown' });
  });
});
