import { describe, expect, it } from 'vitest';
import { matchOutline } from '../src/match.js';
import { locatePins, makePin } from '../src/pins.js';
import { BUDGET, HIRING, OUTLINE, ROADMAP, transcript } from './helpers.js';

const place = (lines: Parameters<typeof transcript>[0], items = OUTLINE) =>
  matchOutline(transcript(lines), items).map((b) => b.itemId);

describe('matchOutline', () => {
  it('places a meeting that follows the outline', () => {
    expect(
      place([
        ['A', BUDGET],
        ['B', HIRING],
        ['A', ROADMAP],
      ]),
    ).toEqual(['o1', 'o2', 'o3']);
  });

  it('allows a jump back when wording clearly says so', () => {
    expect(
      place([
        ['A', BUDGET],
        ['B', HIRING],
        ['A', ROADMAP],
        ['B', BUDGET],
      ]),
    ).toEqual(['o1', 'o2', 'o3', 'o1']);
  });

  it('handles a skipped heading', () => {
    expect(
      place([
        ['A', BUDGET],
        ['B', ROADMAP],
      ]),
    ).toEqual(['o1', 'o3']);
  });

  it('leaves a heading nobody discussed without blocks', () => {
    const ids = place([
      ['A', BUDGET],
      ['B', ROADMAP],
    ]);
    expect(ids).not.toContain('o2');
  });

  it('keeps off-topic chat in Not placed', () => {
    const chat =
      'did you see the football game yesterday evening what amazing goal and the weather looks lovely outside today';
    expect(
      place([
        ['A', BUDGET],
        ['B', chat],
        ['A', HIRING],
      ]),
    ).toEqual(['o1', null, 'o2']);
  });

  it('keeps a filler word inside its topic', () => {
    const ids = place([
      ['A', BUDGET],
      ['B', 'yeah right', 0.5],
      ['A', BUDGET, 0.5],
    ]);
    expect(ids).toEqual(['o1', 'o1', 'o1']);
  });

  it('tells apart two headings with similar words', () => {
    const items = [
      { id: 'o1', level: 1, text: 'Hiring engineers' },
      { id: 'o2', level: 1, text: 'Hiring sales staff' },
    ];
    const ids = place(
      [
        [
          'A',
          'hiring engineers means more engineers on the platform and engineers for the backend services soon enough',
        ],
        [
          'B',
          'hiring sales staff is separate and the sales staff targets need sales staff before autumn arrives',
        ],
      ],
      items,
    );
    expect(ids).toEqual(['o1', 'o2']);
  });

  it('uses the parent heading as weaker context for a subheading', () => {
    const items = [
      { id: 'o1', level: 1, text: 'Budget' },
      { id: 'o2', level: 2, text: 'Travel' },
      { id: 'o3', level: 1, text: 'Roadmap' },
    ];
    const ids = place(
      [
        [
          'A',
          'the travel budget for flights and travel hotels is far too high compared with the budget approved earlier',
        ],
        ['B', ROADMAP],
      ],
      items,
    );
    expect(ids[0]).toBe('o2');
  });

  it('uses the owner as a bonus but never alone', () => {
    const items = [
      { id: 'o1', level: 1, text: 'Budget review' },
      { id: 'o2', level: 1, text: 'Budget forecast', ownerName: 'Dana' },
    ];
    const words = transcript([
      [
        'S2',
        'the budget numbers came out and the budget figures look about the same overall now after forecast review',
      ],
    ]);
    const withOwner = matchOutline(words, items, { speakerNames: { S2: 'dana' } });
    expect(withOwner[0]!.itemId).toBe('o2');
    const chat = transcript([
      [
        'S2',
        'did you see the football game yesterday evening what amazing goal and the weather looks lovely outside today',
      ],
    ]);
    expect(matchOutline(chat, items, { speakerNames: { S2: 'dana' } })[0]!.itemId).toBeNull();
  });

  it('lets a pin win over automatic placement and place the rest automatically', () => {
    const words = transcript([
      ['A', BUDGET],
      ['B', HIRING],
      ['A', ROADMAP],
    ]);
    const hiringStart = words.findIndex((w) => w.speaker === 'B');
    const pin = makePin('p1', words, hiringStart, hiringStart + 4, 'o3');
    const placed = matchOutline(words, OUTLINE, { pins: locatePins([pin], words) });
    const pinned = placed.find((b) => b.pin);
    expect(pinned).toMatchObject({
      itemId: 'o3',
      confidence: 'confirmed',
      first: hiringStart,
      last: hiringStart + 4,
    });
    expect(placed.filter((b) => !b.pin).map((b) => b.itemId)).toContain('o1');
  });

  it('does not apply a needsRecheck pin', () => {
    const words = transcript([['A', BUDGET]]);
    const pin = makePin('p1', words, 0, 4, 'o3');
    const ghost = {
      ...pin,
      firstWordId: 'gone',
      lastWordId: 'gone2',
      fingerprint: { ...pin.fingerprint, words: ['zzz'] },
    };
    const placed = matchOutline(words, OUTLINE, { pins: locatePins([ghost], words) });
    expect(placed.some((b) => b.pin)).toBe(false);
    expect(placed[0]!.itemId).toBe('o1');
  });

  it('is deterministic', () => {
    const words = transcript([
      ['A', BUDGET],
      ['B', HIRING],
      ['A', ROADMAP],
      ['B', BUDGET],
    ]);
    expect(matchOutline(words, OUTLINE)).toEqual(matchOutline(words, OUTLINE));
  });

  it('returns nothing for no words and Not placed for no items', () => {
    expect(matchOutline([], OUTLINE)).toEqual([]);
    expect(matchOutline(transcript([['A', BUDGET]]), []).map((b) => b.itemId)).toEqual([null]);
  });

  it('covers every word exactly once', () => {
    const words = transcript([
      ['A', BUDGET],
      ['B', 'yeah', 0.2],
      ['A', HIRING],
    ]);
    const placed = matchOutline(words, OUTLINE);
    expect(placed.reduce((n, b) => n + b.last - b.first + 1, 0)).toBe(words.length);
  });

  it('handles 500 blocks against 60 items in under 2 seconds', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      id: `o${i}`,
      level: 1,
      text: `topic${i} alpha${i}`,
    }));
    const lines: Parameters<typeof transcript>[0] = Array.from({ length: 500 }, (_, i) => [
      i % 2 ? 'A' : 'B',
      `topic${i % 60} alpha${i % 60} one two three four five six seven eight nine ten eleven twelve`,
    ]);
    const words = transcript(lines);
    const start = performance.now();
    const placed = matchOutline(words, items);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(placed.length).toBe(500);
  });
});
