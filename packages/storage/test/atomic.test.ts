import { spawn } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { atomicWriteFile, removeTempFiles, type WriteStep } from '../src/atomic.ts';
import { tempDir } from './helpers.ts';

const STEPS: WriteStep[] = ['temp-created', 'temp-partly-written', 'temp-synced', 'renamed'];

describe('atomicWriteFile', () => {
  it('replaces the file and leaves no temp file', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'transcript.json');
    await atomicWriteFile(file, 'one');
    await atomicWriteFile(file, 'two');
    expect(await readFile(file, 'utf8')).toBe('two');
    expect(await readdir(dir)).toEqual(['transcript.json']);
  });

  it.each(STEPS)('a crash at %s leaves a whole file', async (step) => {
    const dir = await tempDir();
    const file = path.join(dir, 'transcript.json');
    await writeFile(file, 'old contents');
    const crash = (at: WriteStep): void => {
      if (at === step) throw new Error('simulated crash');
    };
    await expect(atomicWriteFile(file, 'new contents', { onStep: crash })).rejects.toThrow();
    const expected = step === 'renamed' ? 'new contents' : 'old contents';
    expect(await readFile(file, 'utf8')).toBe(expected);
    await removeTempFiles(dir);
    expect(await readdir(dir)).toEqual(['transcript.json']);
  });

  it('survives a real process kill mid-write, every time', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'transcript.json');
    const child = fileURLToPath(new URL('./fixtures/write-loop.ts', import.meta.url));
    for (let round = 0; round < 6; round += 1) {
      const proc = spawn(process.execPath, ['--no-warnings', child, file], {
        stdio: ['ignore', 'pipe', 'inherit'],
      });
      await new Promise<void>((resolve) => proc.stdout.once('data', () => resolve()));
      await new Promise((resolve) => setTimeout(resolve, 10 + round * 13));
      proc.kill('SIGKILL');
      await new Promise((resolve) => proc.once('exit', resolve));

      const parsed = JSON.parse(await readFile(file, 'utf8')) as { payload: string; check: number };
      expect(parsed.payload.length).toBe(parsed.check);
      await removeTempFiles(dir);
      expect(await readdir(dir)).toEqual(['transcript.json']);
    }
  }, 30_000);

  it('removes only its own temp files', async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, 'chunk-000.opus'), 'audio');
    await writeFile(path.join(dir, 'transcript.json.tmp-abc123'), 'partial');
    expect(await removeTempFiles(dir)).toEqual(['transcript.json.tmp-abc123']);
    expect(await readdir(dir)).toEqual(['chunk-000.opus']);
  });
});
