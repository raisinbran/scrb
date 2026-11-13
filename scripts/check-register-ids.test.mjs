import { describe, expect, it } from 'vitest';
import { KNOWN_SHORT_ROWS, findBadUsageRows, findDuplicateIds } from './check-register-ids.mjs';

const row = (task, cols = 12) => `| 2026-11-13 | a | ${task} ${'| x '.repeat(cols - 3)}|`;

describe('findDuplicateIds', () => {
  it('accepts unique ids and ignores correction headings', () => {
    expect(findDuplicateIds('| A-001 | x |\n### A-002 — a\n### A-002 correction — b\n')).toEqual(
      [],
    );
  });
  it('flags a repeated id across row and heading forms', () => {
    expect(
      findDuplicateIds('| A-001 | x |\n### A-001 — again\n### A-005 - y\n### A-005 - z\n'),
    ).toEqual(['A-001', 'A-005']);
  });
  it('grandfathers exactly the two existing A-104 entries', () => {
    expect(findDuplicateIds('| A-104 | x |\n### A-104 — y\n')).toEqual([]);
    expect(findDuplicateIds('| A-104 | x |\n### A-104 — y\n### A-104 — z\n')).toEqual(['A-104']);
  });
});

describe('findBadUsageRows', () => {
  it('accepts well-formed rows and ignores non-rows', () => {
    expect(findBadUsageRows(`${row('t1')}\n${row('t2')}\n| --- | --- |\nprose\n`)).toEqual([]);
  });
  it('flags a malformed column count', () => {
    expect(findBadUsageRows(row('t1', 11))).toHaveLength(1);
    expect(findBadUsageRows(row('t1', 13))).toHaveLength(1);
  });
  it('flags a duplicated row', () => {
    expect(findBadUsageRows(`${row('t1')}\n${row('t1')}`)).toEqual(['line 2: duplicate row']);
  });
  it('grandfathers the two known 11-column rows by identity only', () => {
    const known = KNOWN_SHORT_ROWS.map((p) => `${p}${'| x '.repeat(8)}|`);
    expect(known.map((r) => findBadUsageRows(r))).toEqual([[], []]);
    expect(findBadUsageRows(row('other', 11))).toHaveLength(1);
  });
});
