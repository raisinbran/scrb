import { describe, expect, it } from 'vitest';
import { parseOutline } from '../src/parse.js';

const shape = (text: string) => parseOutline(text).items.map((i) => `${i.level}:${i.text}`);

describe('parseOutline', () => {
  it('reads markdown headings', () => {
    expect(shape('# Budget\n## Hiring\n# Roadmap')).toEqual(['1:Budget', '2:Hiring', '1:Roadmap']);
  });
  it('reads numbering depth', () => {
    expect(shape('1. Budget\n1.1 Hiring\n1.1.1 Contractors\n2. Roadmap')).toEqual([
      '1:Budget',
      '2:Hiring',
      '3:Contractors',
      '1:Roadmap',
    ]);
  });
  it('nests bullets and letters under a numbered line', () => {
    expect(shape('1. Budget\n- Hiring\n- Travel\n2. Roadmap\nA. Mobile')).toEqual([
      '1:Budget',
      '2:Hiring',
      '2:Travel',
      '1:Roadmap',
      '2:Mobile',
    ]);
  });
  it('keeps a flat bullet list flat', () => {
    expect(shape('- One\n- Two\n- Three')).toEqual(['1:One', '1:Two', '1:Three']);
  });
  it('reads indentation of 2 spaces or one tab', () => {
    expect(shape('Budget\n  Hiring\n\t\tContractors\nRoadmap')).toEqual([
      '1:Budget',
      '2:Hiring',
      '3:Contractors',
      '1:Roadmap',
    ]);
  });
  it('skips blank lines and CRLF', () => {
    expect(shape('Budget\r\n\r\n\r\nRoadmap\r\n')).toEqual(['1:Budget', '1:Roadmap']);
  });
  it('reads a trailing owner', () => {
    const r = parseOutline(
      '1. Budget (Dana)\n2. Hiring - Sam Lee\n3. Plan (Q3)\n4. Review - overview',
    );
    expect(r.items.map((i) => [i.text, i.ownerName])).toEqual([
      ['Budget', 'Dana'],
      ['Hiring', 'Sam Lee'],
      ['Plan (Q3)', undefined],
      ['Review - overview', undefined],
    ]);
  });
  it('clamps a skipped level with a note', () => {
    const r = parseOutline('# A\n### B');
    expect(r.items[1]!.level).toBe(2);
    expect(r.notes).toHaveLength(1);
  });
  it('rejects empty, oversized and too many items', () => {
    expect(parseOutline('  \n ').error).toBe('empty');
    expect(parseOutline('x'.repeat(50_001)).error).toBe('tooLong');
    expect(parseOutline(Array.from({ length: 201 }, (_, i) => `Item ${i}`).join('\n')).error).toBe(
      'tooManyItems',
    );
    expect(
      parseOutline(Array.from({ length: 200 }, (_, i) => `Item ${i}`).join('\n')).items,
    ).toHaveLength(200);
  });
  it('gives ids in order', () => {
    expect(parseOutline('A\nB').items.map((i) => i.id)).toEqual(['o1', 'o2']);
  });
});
