import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('summary workspace dependency pins', () => {
  it('keeps the type declarations and compiler exact in the manifest and lockfile', async () => {
    const manifest = JSON.parse(
      await readFile(resolve(root, 'packages/summary/package.json'), 'utf8'),
    ) as { devDependencies: Record<string, string> };
    const lock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { devDependencies?: Record<string, string> }>;
    };
    const locked = lock.packages['packages/summary']?.devDependencies;
    expect(locked).toBeDefined();
    for (const dependency of ['@types/node', 'typescript']) {
      const version = manifest.devDependencies[dependency];
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(locked?.[dependency]).toBe(version);
    }
  });
});
