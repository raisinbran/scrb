import { describe, expect, it } from 'vitest';
import { APPROVALS_FILE, approvalAdded, findViolations } from './check-boundaries.mjs';

const contract = 'packages/contracts/src/validate.ts';

describe('findViolations', () => {
  it('checks contract edits on every branch, whatever its prefix', () => {
    for (const branch of ['cod/x', 'rosmont/x', 'ui/x', 'backend/x'])
      expect(findViolations(branch, [contract], false)).toHaveLength(1);
  });
  it('accepts a contract edit that adds an approval row', () => {
    expect(findViolations('cod/x', [contract, APPROVALS_FILE], true)).toEqual([]);
  });
  it('ignores branches that do not touch the contract', () => {
    expect(findViolations('cod/x', ['apps/desktop/src/main/main.ts'], false)).toEqual([]);
  });
  it('keeps the UI/backend folder rule for ui/ and backend/ branches only', () => {
    expect(findViolations('ui/x', ['packages/storage/src/library.ts'], false)).toHaveLength(1);
    expect(findViolations('backend/x', ['apps/desktop/src/ui/App.tsx'], false)).toHaveLength(1);
    expect(findViolations('cod/x', ['apps/desktop/src/ui/App.tsx'], false)).toEqual([]);
  });
});

describe('approvalAdded', () => {
  const header = '| Date (PT) | PR | Change | Owner decision |\n| --- | --- | --- | --- |\n';
  const old = '| 2026-11-13 | — | `cancelSummary` call | Approved by the owner |\n';
  const base = header + old;
  const row =
    '| 2026-11-24 | #470 | Add `listDevices` call | Owner approved in chat 2026-11-24 |\n';

  it('accepts one new complete row that keeps history', () => {
    expect(approvalAdded(base, base + row)).toBe(true);
    expect(approvalAdded('', header + row)).toBe(true);
  });
  it('rejects formatting-only changes', () => {
    const padded = base.replace('| — |', '|   —   |').replace('| --- |', '| :--- |');
    expect(approvalAdded(base, padded)).toBe(false);
    expect(approvalAdded(base, base + '\n')).toBe(false);
  });
  it('rejects empty or incomplete rows', () => {
    expect(approvalAdded(base, base + '|  |  |  |  |\n')).toBe(false);
    expect(approvalAdded(base, base + '| 2026-11-24 | #470 | Add call |  |\n')).toBe(false);
    expect(approvalAdded(base, base + '| 2026-11-24 | 470 | Add call | Approved |\n')).toBe(false);
    expect(approvalAdded(base, base + '| 24 Nov | #470 | Add call | Approved |\n')).toBe(false);
    expect(
      approvalAdded(base, base + '| 2026-11-24 | #470 | Add call | Approved | extra |\n'),
    ).toBe(false);
  });
  it('rejects rewriting or removing a historical row, even alongside a new one', () => {
    const rewritten = header + old.replace('Approved by the owner', 'Approved') + row;
    expect(approvalAdded(base, rewritten)).toBe(false);
    expect(approvalAdded(base, header + row)).toBe(false);
  });
});
