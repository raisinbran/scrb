import { mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
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

  it('redacts invented transcript-like text even under generic diagnostic keys', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scrb-private-field-'));
    const logger = new Logger(dir, () => new Date('2026-10-31T12:00:00Z'));
    const invented = 'FictionalClientWaterfall';
    logger.log('warn', 'worker-state', {
      state: invented,
      status: invented,
      code: invented,
      track: 'microphone',
      ...errorFields({ name: 'WorkerFailed', code: 'EACCES' }),
    });
    await logger.flush();
    const text = await readFile(join(dir, 'scrb-2026-10-31.log'), 'utf8');
    expect(text).not.toContain(invented);
    expect(JSON.parse(text)).toMatchObject({
      state: '[redacted]',
      status: '[redacted]',
      error: 'WorkerFailed',
      code: 'EACCES',
      track: 'microphone',
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
    const worker = spawn(
      process.execPath,
      [
        '-e',
        `process.stdout.write("${privateWords}"); process.stderr.write("${privateWords}"); process.exit(4)`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    worker.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    worker.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    const code = await new Promise<number | null>((resolve) => worker.once('close', resolve));
    expect(code).toBe(4);
    expect(Buffer.concat(stderr).toString()).toContain(privateWords);
    expect(Buffer.concat(stdout).toString()).toContain(privateWords);
    const logger = new Logger(dir, () => new Date('2026-10-31T12:00:00Z'));
    logger.log('error', 'native-worker-failed', {
      ...errorFields(Object.assign(new Error(privateWords), { name: 'WorkerFailed' })),
      stderr: Buffer.concat(stderr).toString(),
      stdout: Buffer.concat(stdout).toString(),
    });
    await logger.flush();
    const saved = await readFile(join(dir, 'scrb-2026-10-31.log'), 'utf8');
    expect(saved).not.toContain(privateWords);
    expect(saved).toContain('[redacted]');
  });
});
