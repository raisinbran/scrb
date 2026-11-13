import { describe, expect, it } from 'vitest';
import { findDuplicateIds } from './check-register-ids.mjs';

describe('findDuplicateIds', () => {
  it('accepts unique ids and ignores correction headings', () => {
    const t = '| A-001 | x |\n### A-002 — a\n### A-002 correction — b\n';
    expect(findDuplicateIds(t)).toEqual([]);
  });
  it('flags a repeated id across row and heading forms', () => {
    const t = '| A-001 | x |\n### A-001 — again\n### A-005 - y\n### A-005 - z\n';
    expect(findDuplicateIds(t)).toEqual(['A-001', 'A-005']);
  });
  it('tolerates the known historical duplicate only', () => {
    expect(findDuplicateIds('| A-104 | x |\n### A-104 — y\n')).toEqual([]);
  });
});
