import { describe, expect, it } from 'vitest';
import { locatePins, makePin } from '../src/pins.js';
import { say } from './helpers.js';
import type { TranscriptWord } from '../src/types.js';

const text =
  'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau';
const base = (prefix: string, shiftMs = 0, speaker = 'A'): TranscriptWord[] =>
  say(speaker, text, shiftMs, prefix).words;

describe('locatePins', () => {
  it('finds a pin by word ids', () => {
    const w = base('a');
    const pin = makePin('p1', w, 4, 8, 'o2');
    const [r] = locatePins([pin], w);
    expect([r!.status, r!.first, r!.last]).toEqual(['ok', 4, 8]);
  });

  it('finds a unique phrase after a re-transcription with new ids and shifted times', () => {
    const old = base('a');
    const pin = makePin('p1', old, 4, 8, 'o2');
    const fresh = base('b', 700);
    const [r] = locatePins([pin], fresh);
    expect([r!.status, r!.first, r!.last]).toEqual(['ok', 4, 8]);
  });

  it('does not apply a pin to either copy of a repeated phrase', () => {
    const old = base('a');
    const pin = makePin('p1', old, 4, 6, 'o2'); // epsilon zeta eta
    const first = base('b', 0);
    // the same words again 3 s later, with identical surroundings
    const second = say('A', text, 3000 + 19 * 400, 'c').words;
    const doubled = [
      ...first.slice(0, 4),
      ...first.slice(4, 7),
      ...first.slice(4, 7),
      ...first.slice(7),
    ].map((w, i) => ({ ...w, id: `d${i}`, startMs: i * 400, endMs: i * 400 + 380 }));
    void second;
    const [r] = locatePins([pin], doubled);
    expect(r!.status).toBe('needsRecheck');
    expect(r!.first).toBeUndefined();
  });

  it('still re-locates a pin whose phrase is unique in the same window', () => {
    const old = base('a');
    const pin = makePin('p1', old, 10, 12, 'o1');
    const doubled = [...old.slice(0, 7), ...old.slice(4, 7), ...old.slice(7)].map((w, i) => ({
      ...w,
      id: `d${i}`,
      startMs: i * 400,
      endMs: i * 400 + 380,
    }));
    const [r] = locatePins([pin], doubled);
    expect(r!.status).toBe('ok');
    expect(doubled[r!.first!]!.text).toBe('lambda');
  });

  it('disambiguates a repeat by surrounding words', () => {
    const old = base('a');
    const pin = makePin('p1', old, 4, 5, 'o2'); // epsilon zeta, context delta / eta
    const words = [...old.slice(0, 3), ...old.slice(7, 9), ...old.slice(3)].map((w, i) => ({
      ...w,
      id: `n${i}`,
      startMs: i * 400,
      endMs: i * 400 + 380,
    }));
    const [r] = locatePins([pin], words);
    expect(r!.status).toBe('ok');
    expect(words[r!.first! - 1]!.text).toBe('delta');
  });

  it('keeps a pin whose words were removed or changed, flagged and unapplied', () => {
    const old = base('a');
    const pin = makePin('p1', old, 4, 8, 'o2');
    const changed = base('b').map((w, i) => (i >= 5 && i <= 7 ? { ...w, text: 'banana' } : w));
    const [r] = locatePins([pin], changed);
    expect(r!.status).toBe('needsRecheck');
    expect(r!.pin).toEqual(pin);
    const removed = base('c').filter((_, i) => i < 3 || i > 10);
    expect(locatePins([pin], removed)[0]!.status).toBe('needsRecheck');
  });

  it('does not search outside the time window', () => {
    const old = base('a');
    const pin = makePin('p1', old, 4, 8, 'o2');
    const far = base('b', 120_000);
    expect(locatePins([pin], far)[0]!.status).toBe('needsRecheck');
  });
});
