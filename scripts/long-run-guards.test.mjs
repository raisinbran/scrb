import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SECONDS, assertEvidenceDir, chooseSeconds } from './long-run/guards.mjs';

let base;
let repo;
let outside;
beforeEach(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), 'long-run-')));
  repo = join(base, 'repo');
  outside = join(base, 'evidence');
  mkdirSync(join(repo, 'sub'), { recursive: true });
  mkdirSync(outside);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe('assertEvidenceDir', () => {
  it('accepts a new folder and an empty folder outside the repository', () => {
    expect(assertEvidenceDir(join(outside, 'new', 'run'), [repo])).toBe(
      join(outside, 'new', 'run'),
    );
    expect(assertEvidenceDir(outside, [repo])).toBe(outside);
  });

  it('rejects the repository, its descendants and its ancestors, even as relative paths', () => {
    const before = process.cwd();
    try {
      process.chdir(repo);
      expect(() => assertEvidenceDir('.', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('sub', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('./sub/../sub/new', [repo])).toThrow(/outside the repository/);
      expect(() => assertEvidenceDir('..', [repo])).toThrow(/outside the repository/);
    } finally {
      process.chdir(before);
    }
  });

  it('rejects a symlink that leads into the repository, also through a new child', () => {
    const link = join(outside, 'link');
    symlinkSync(join(repo, 'sub'), link);
    expect(() => assertEvidenceDir(link, [repo])).toThrow(/outside the repository/);
    expect(() => assertEvidenceDir(join(link, 'fresh'), [repo])).toThrow(/outside the repository/);
  });

  it('rejects a folder inside any of several repository roots', () => {
    expect(() => assertEvidenceDir(join(outside, 'x'), [repo, outside])).toThrow(/outside/);
  });

  it('rejects a folder that already holds logs but no audio, and a plain file', () => {
    mkdirSync(join(outside, 'old', 'logs'), { recursive: true });
    expect(() => assertEvidenceDir(join(outside, 'old'), [repo])).toThrow(/not empty/);
    writeFileSync(join(outside, 'file'), '');
    expect(() => assertEvidenceDir(join(outside, 'file'), [repo])).toThrow(/not a folder/);
  });
});

describe('chooseSeconds', () => {
  it('defaults to 5 minutes and takes longer runs only when given', () => {
    expect(chooseSeconds(undefined)).toBe(DEFAULT_SECONDS);
    expect(DEFAULT_SECONDS).toBe(300);
    expect(chooseSeconds('28800')).toBe(28800);
    expect(() => chooseSeconds('10')).toThrow();
    expect(() => chooseSeconds('abc')).toThrow();
  });
});
