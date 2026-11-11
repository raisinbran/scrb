// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chooseVerifiedRollback } from './model-rollback.ts';

const pin = (path: string, bytes: Buffer) => ({
  path,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  sizeBytes: bytes.length,
});

describe('offline rollback candidate verification', () => {
  it('selects only checksum-verified previous bytes, without changing current files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scrb-model-revert-'));
    try {
      const currentData = Buffer.from('invented current weights');
      const previousData = Buffer.from('invented previous weights');
      const current = pin(join(dir, 'current.gguf'), currentData);
      const previous = pin(join(dir, 'previous.gguf'), previousData);
      await writeFile(current.path, currentData);
      await writeFile(previous.path, previousData);
      expect(await chooseVerifiedRollback(current, previous)).toEqual({
        active: previous,
        previous: current,
      });
      expect(await readFile(current.path)).toEqual(currentData);
      expect(await readFile(previous.path)).toEqual(previousData);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refuses missing, damaged and same-path rollback candidates', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'scrb-model-revert-'));
    try {
      const currentData = Buffer.from('invented current weights');
      const previousData = Buffer.from('invented previous weights');
      const current = pin(join(dir, 'current.gguf'), currentData);
      const previous = pin(join(dir, 'previous.gguf'), previousData);
      await writeFile(current.path, currentData);
      await expect(chooseVerifiedRollback(current, null)).rejects.toThrow('previous');
      await expect(chooseVerifiedRollback(current, current)).rejects.toThrow('separate');
      await expect(chooseVerifiedRollback(current, previous)).rejects.toThrow('verification');
      await writeFile(previous.path, Buffer.from('invented tampered weights'));
      await expect(chooseVerifiedRollback(current, previous)).rejects.toThrow('verification');
      expect(await readFile(current.path)).toEqual(currentData);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
