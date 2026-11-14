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

  describe('stable ids across revisions', () => {
    const v1 = parseOutline('Budget\nHiring\nRoadmap').items;
    const id = (items: typeof v1, text: string) => items.find((i) => i.text === text)!.id;

    it('keeps ids when a heading is inserted ahead of a pinned one', () => {
      const v2 = parseOutline('Budget\nTravel\nHiring\nRoadmap', v1).items;
      expect(id(v2, 'Hiring')).toBe(id(v1, 'Hiring'));
      expect(id(v2, 'Roadmap')).toBe(id(v1, 'Roadmap'));
      expect(new Set(v2.map((i) => i.id)).size).toBe(4);
      expect(v1.map((i) => i.id)).not.toContain(id(v2, 'Travel'));
    });
    it('keeps ids when headings are reordered', () => {
      const v2 = parseOutline('Roadmap\nBudget\nHiring', v1).items;
      for (const t of ['Budget', 'Hiring', 'Roadmap']) expect(id(v2, t)).toBe(id(v1, t));
    });
    it('never reuses the id of a deleted or edited heading', () => {
      const v2 = parseOutline('Budget\nRoadmap', v1).items;
      const v3 = parseOutline('Budget\nHiring plan\nRoadmap', v2).items;
      expect(id(v3, 'Hiring plan')).not.toBe(id(v1, 'Hiring'));
      expect(v3.map((i) => i.id)).not.toContain(id(v1, 'Hiring'));
    });
    it('tells apart the same subheading under different parents', () => {
      const a = parseOutline('# A\n## Plan\n# B\n## Plan').items;
      expect(new Set(a.map((i) => i.id)).size).toBe(4);
      const b = parseOutline('# B\n## Plan\n# A\n## Plan', a).items;
      expect(b.map((i) => i.id)).toEqual([a[2]!.id, a[3]!.id, a[0]!.id, a[1]!.id]);
    });
  });
});
