import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { findBadUsageRows, findDuplicateIds } from './check-register-ids.mjs';

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
  it('grandfathers the two real 11-column rows by full-row hash only', () => {
    const real = readFileSync('agents/usage-log.md', 'utf8')
      .split('\n')
      .filter((l) =>
        l.startsWith('| 2026-11-12 | Codex / GPT-6 / Windows desktop | PHASE0-STEP2-WINDOWS'),
      );
    expect(real).toHaveLength(2);
    expect(real.map((r) => findBadUsageRows(r))).toEqual([[], []]);
    for (const r of real) expect(findBadUsageRows(r.replace('Codex', 'Codex2'))).toHaveLength(1);
    expect(findBadUsageRows(`${real[0]} `)).toHaveLength(1);
    expect(findBadUsageRows(row('other', 11))).toHaveLength(1);
  });
});
