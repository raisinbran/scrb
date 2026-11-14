import { describe, expect, it } from 'vitest';
import { cosine, itemEmbeddingTexts } from '../src/embed.js';
import { matchOutline } from '../src/match.js';
import { HIRING, OUTLINE, transcript } from './helpers.js';

const unit = (...v: number[]): Float32Array => Float32Array.from(v);

describe('Level B (semantic option)', () => {
  it('cosine of unit vectors', () => {
    expect(cosine(unit(1, 0), unit(1, 0))).toBe(1);
    expect(cosine(unit(1, 0), unit(0, 1))).toBe(0);
  });

  it('puts parent headings before the item text', () => {
    const items = [
      { id: 'a', level: 1, text: 'Hiring' },
      { id: 'b', level: 2, text: 'Headcount' },
    ];
    expect(itemEmbeddingTexts(items)).toEqual(['Hiring', 'Hiring: Headcount']);
  });

  it('is ignored at weight 0 and moves a block with no shared words at weight 1', () => {
    const words = transcript([
      [
        'A',
        'violet kettle harbour quartz ladder meadow piano lantern orchard falcon marble thistle cobalt anchor',
      ],
    ]);
    const vectors = {
      blocks: [unit(0, 1, 0)],
      items: [unit(1, 0, 0), unit(0, 1, 0), unit(0, 0, 1)],
    };
    const off = matchOutline(words, OUTLINE, { semantic: vectors });
    expect(off[0]!.itemId).not.toBe('o2');
    const on = matchOutline(words, OUTLINE, {
      semantic: vectors,
      tuning: { semanticWeight: 1, cosineFloor: 0, notPlacedScore: 0.1 },
    });
    expect(on[0]!.itemId).toBe('o2');
  });

  it('rejects vectors that do not match the blocks', () => {
    expect(() =>
      matchOutline(transcript([['A', HIRING]]), OUTLINE, {
        semantic: { blocks: [], items: [] },
        tuning: { semanticWeight: 0.5 },
      }),
    ).toThrow();
  });
});
