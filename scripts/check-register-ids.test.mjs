import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  checkIncidentFile,
  checkUsageRowFile,
  findBadUsageRows,
  findDuplicateIds,
} from './check-register-ids.mjs';

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
      .split(/\r?\n/)
      .filter((l) =>
        l.startsWith('| 2026-11-12 | Codex / GPT-6 / Windows desktop | PHASE0-STEP2-WINDOWS'),
      );
    expect(real).toHaveLength(2);
    expect(real.map((r) => findBadUsageRows(r))).toEqual([[], []]);
    for (const r of real) expect(findBadUsageRows(r.replace('Codex', 'Codex2'))).toHaveLength(1);
    expect(findBadUsageRows(`${real[0]} `)).toHaveLength(1);
    expect(findBadUsageRows(row('other', 11))).toHaveLength(1);
  });
  it('handles CRLF checkouts: the real rows still pass, a changed one still fails', () => {
    const real = readFileSync('agents/usage-log.md', 'utf8')
      .split(/\r?\n/)
      .filter((l) =>
        l.startsWith('| 2026-11-12 | Codex / GPT-6 / Windows desktop | PHASE0-STEP2-WINDOWS'),
      );
    expect(findBadUsageRows(`${real.join('\r\n')}\r\n`)).toEqual([]);
    expect(
      findBadUsageRows(real.map((r) => r.replace('Codex', 'Codex2')).join('\r\n')),
    ).toHaveLength(2);
    expect(findDuplicateIds('| A-001 | x |\r\n### A-001 — y\r\n')).toEqual(['A-001']);
  });
});

describe('per-file scheme', () => {
  it('accepts a one-row usage file and rejects zero, two or malformed rows', () => {
    expect(checkUsageRowFile(`${row('t1')}\n`)).toEqual([]);
    expect(checkUsageRowFile('prose only')).toHaveLength(1);
    expect(checkUsageRowFile(`${row('t1')}\n${row('t2')}`)).toHaveLength(1);
    expect(checkUsageRowFile(row('t1', 11))).toHaveLength(1);
  });
  it('rejects a valid row followed by a malformed table row, but allows a separator', () => {
    expect(checkUsageRowFile(`${row('t1')}\n| 2026-13 | bad |\n`)).toHaveLength(1);
    expect(checkUsageRowFile(`${row('t1')}\n| not a date | x |\n`)).toHaveLength(1);
    expect(checkUsageRowFile(`${row('t1')}\n| --- | --- |\n`)).toEqual([]);
  });
  it('accepts an incident file whose name matches its heading and rejects others', () => {
    expect(
      checkIncidentFile('A-400-x.md', '### A-400 — 2026-11-13 — t\n- **Status:** y\n'),
    ).toEqual([]);
    expect(checkIncidentFile('A-401-x.md', '### A-400 — t\n')).toHaveLength(1);
    expect(checkIncidentFile('A-400-x.md', 'no heading')).toHaveLength(1);
    expect(checkIncidentFile('A-400-x.md', '### A-400 — a\n### A-401 — b\n')).toHaveLength(1);
  });
  it('flags the same A-number in the legacy register and a folder file, or in two folder files', () => {
    const legacy = '### A-341 — old\n';
    expect(findDuplicateIds(`${legacy}\n### A-341 — new\n`)).toEqual(['A-341']);
    expect(findDuplicateIds('### A-400 — a\n\n### A-400 — b\n')).toEqual(['A-400']);
    expect(findDuplicateIds(`${legacy}\n### A-342 — new\n`)).toEqual([]);
  });
  it('flags an identical usage row repeated across files', () => {
    expect(findBadUsageRows(`${row('t1')}\n${row('t1')}`)).toEqual(['line 2: duplicate row']);
  });
});
