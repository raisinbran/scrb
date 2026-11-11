// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { verifyPinnedModel } from '../src/model-artifacts.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describe('owner-pinned local model verification', () => {
  it('accepts exact bytes without downloading or altering the file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-model-'));
    const file = join(root, 'fake-model.gguf');
    await writeFile(file, 'invented model contents');
    expect(
      await verifyPinnedModel({
        path: file,
        sha256: sha256('invented model contents'),
        sizeBytes: 23,
      }),
    ).toEqual({ ok: true, sha256: sha256('invented model contents') });
  });

  it('rejects missing, corrupted, wrong-size and unpinned files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-model-'));
    const file = join(root, 'fake-model.gguf');
    await writeFile(file, 'sample');
    expect(await verifyPinnedModel({ path: file, sha256: sha256('sample'), sizeBytes: 0 })).toEqual(
      { ok: false, reason: 'invalidManifest' },
    );
    expect(
      await verifyPinnedModel({ path: join(root, 'absent'), sha256: sha256('x'), sizeBytes: 1 }),
    ).toEqual({ ok: false, reason: 'missing' });
    expect(
      await verifyPinnedModel({ path: file, sha256: sha256('sample'), sizeBytes: 10 }),
    ).toEqual({ ok: false, reason: 'sizeMismatch' });
    expect(await verifyPinnedModel({ path: file, sha256: sha256('other'), sizeBytes: 6 })).toEqual({
      ok: false,
      reason: 'hashMismatch',
    });
  });

  it.skipIf(process.platform === 'win32')(
    'rejects a model symlink even when contents match',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'scrb-model-'));
      const original = join(root, 'actual.gguf');
      const link = join(root, 'link.gguf');
      await writeFile(original, 'invented');
      await symlink(original, link);
      expect(
        await verifyPinnedModel({ path: link, sha256: sha256('invented'), sizeBytes: 8 }),
      ).toEqual({ ok: false, reason: 'unsafeFile' });
    },
  );
});
