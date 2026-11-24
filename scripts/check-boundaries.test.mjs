import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  APPROVALS_FILE,
  approvalStatus,
  changedPaths,
  findViolations,
} from './check-boundaries.mjs';

const contract = 'packages/contracts/src/validate.ts';
const ok = { historyKept: true, newRow: true };
const none = { historyKept: true, newRow: false };

describe('findViolations', () => {
  it('checks contract edits on every branch, whatever its prefix', () => {
    for (const branch of ['cod/x', 'rosmont/x', 'ui/x', 'backend/x'])
      expect(findViolations(branch, [contract], none)).toHaveLength(1);
  });
  it('accepts a contract edit that adds an approval row', () => {
    expect(findViolations('cod/x', [contract, APPROVALS_FILE], ok)).toEqual([]);
  });
  it('ignores branches that do not touch the contract', () => {
    expect(findViolations('cod/x', ['apps/desktop/src/main/main.ts'], none)).toEqual([]);
  });
  it('rejects register-only edits that drop history, including deleting the register', () => {
    const lost = { historyKept: false, newRow: false };
    expect(findViolations('cod/x', [APPROVALS_FILE], lost)).toHaveLength(1);
    expect(findViolations('cod/x', [APPROVALS_FILE], none)).toEqual([]);
  });
  it('keeps the UI/backend folder rule for ui/ and backend/ branches only', () => {
    expect(findViolations('ui/x', ['packages/storage/src/library.ts'], none)).toHaveLength(1);
    expect(findViolations('backend/x', ['apps/desktop/src/ui/App.tsx'], none)).toHaveLength(1);
    expect(findViolations('cod/x', ['apps/desktop/src/ui/App.tsx'], none)).toEqual([]);
  });
});

describe('approvalStatus', () => {
  const header = '| Date (PT) | PR | Change | Owner decision |\n| --- | --- | --- | --- |\n';
  const old = '| 2026-11-13 | — | `cancelSummary` call | Approved by the owner |\n';
  const base = header + old;
  const row =
    '| 2026-11-24 | #470 | Add `listDevices` call | Owner approved in chat 2026-11-24 |\n';

  it('accepts one new complete row that keeps history', () => {
    expect(approvalStatus(base, base + row)).toEqual(ok);
    expect(approvalStatus('', header + row)).toEqual(ok);
  });
  it('treats formatting-only changes as no new row', () => {
    const padded = base.replace('| — |', '|   —   |').replace('| --- |', '| :--- |');
    expect(approvalStatus(base, padded)).toEqual(none);
    expect(approvalStatus(base, base + '\n')).toEqual(none);
  });
  it('rejects empty or incomplete rows', () => {
    for (const bad of [
      '|  |  |  |  |',
      '| 2026-11-24 | #470 | Add call |  |',
      '| 2026-11-24 | 470 | Add call | Approved |',
      '| 24 Nov | #470 | Add call | Approved |',
      '| 2026-11-24 | #470 | Add call | Approved | extra |',
    ])
      expect(approvalStatus(base, `${base}${bad}\n`).newRow).toBe(false);
  });
  it('flags a rewritten, removed or deleted historical row', () => {
    const rewritten = header + old.replace('Approved by the owner', 'Approved') + row;
    expect(approvalStatus(base, rewritten).historyKept).toBe(false);
    expect(approvalStatus(base, header + row).historyKept).toBe(false);
    expect(approvalStatus(base, header).historyKept).toBe(false);
    expect(approvalStatus(base, '').historyKept).toBe(false);
  });
});

describe('changedPaths', () => {
  let repo;
  afterEach(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
      cwd: repo,
      stdio: 'pipe',
    });
  const write = (file, text) => {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), text);
  };

  // Guards the --no-renames and -z flags: without them a move out of the contract folder lists only
  // its destination, and git quotes a non-ASCII path so it no longer starts with the folder prefix.
  it('lists both sides of a move and unquoted non-ASCII paths', () => {
    repo = mkdtempSync(join(tmpdir(), 'scrb-boundary-'));
    git('init', '-q', '-b', 'main');
    write('packages/contracts/src/a.ts', 'export const a = 1;\n'.repeat(20));
    git('add', '-A');
    git('commit', '-qm', 'base');
    git('checkout', '-qb', 'cod/x');
    mkdirSync(join(repo, 'packages/other'), { recursive: true });
    renameSync(join(repo, 'packages/contracts/src/a.ts'), join(repo, 'packages/other/a.ts'));
    write('packages/contracts/src/café.ts', 'export const b = 2;\n');
    git('add', '-A');
    git('commit', '-qm', 'move and add');

    const changed = changedPaths(repo, 'main');
    expect(changed).toEqual(
      expect.arrayContaining([
        'packages/contracts/src/a.ts',
        'packages/other/a.ts',
        'packages/contracts/src/café.ts',
      ]),
    );
    expect(findViolations('cod/x', changed, none)).toHaveLength(1);
  });
});
