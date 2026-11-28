import { describe, expect, it } from 'vitest';
import { statusMissing } from './check-gate-status.mjs';

describe('statusMissing', () => {
  it('flags gate files changed without STATUS.md', () => {
    expect(statusMissing(['docs/gates/gate-6.md', 'README.md'])).toEqual(['docs/gates/gate-6.md']);
  });
  it('accepts a gate change that also updates STATUS.md', () => {
    expect(statusMissing(['docs/gates/gate-6.md', 'docs/gates/STATUS.md'])).toEqual([]);
  });
  it('ignores STATUS.md alone and unrelated files', () => {
    expect(statusMissing(['docs/gates/STATUS.md'])).toEqual([]);
    expect(statusMissing(['docs/plans/x.md'])).toEqual([]);
  });
});
