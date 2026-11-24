import { describe, expect, it } from 'vitest';
import { APPROVALS_FILE, findViolations } from './check-boundaries.mjs';

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
