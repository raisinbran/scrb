import { describe, expect, it } from 'vitest';
import { LiveEchoFilter, type TimedLiveSegment } from '../src/index.js';

function seg(
  track: 'mic' | 'meeting',
  id: string,
  startMs: number,
  text: string,
): TimedLiveSegment {
  const words = text.split(' ').map((t, i) => ({
    text: t,
    startMs: startMs + i * 300,
    endMs: startMs + i * 300 + 250,
    confidence: 0.9,
  }));
  return {
    id,
    track,
    sequence: 1,
    startMs: words[0]!.startMs,
    endMs: words.at(-1)!.endMs,
    text,
    words,
    speakerId: track === 'mic' ? 'you' : 'meeting',
    speakerLabel: track === 'mic' ? 'You' : 'Meeting',
    provisional: true,
  };
}

function rig(holdMs = 2000) {
  let t = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const out: TimedLiveSegment[] = [];
  const f = new LiveEchoFilter((s) => out.push(s), {
    holdMs,
    now: () => t,
    setTimer: (fn, ms) => {
      const x = { at: t + ms, fn };
      timers.push(x);
      return x;
    },
    clearTimer: (x) => timers.splice(timers.indexOf(x as never), 1),
  });
  const advance = (ms: number) => {
    t += ms;
    for (const x of timers.filter((y) => y.at <= t)) {
      timers.splice(timers.indexOf(x), 1);
      x.fn();
    }
  };
  return { f, out, advance, texts: () => out.map((s) => `${s.track}:${s.text}`) };
}

describe('LiveEchoFilter', () => {
  it('drops mic echo when the meeting words arrive after the mic segment', () => {
    const r = rig();
    r.f.push(seg('mic', 'm1', 5400, 'we should ship it'));
    r.advance(500);
    r.f.push(seg('meeting', 'a1', 5000, 'we should ship it'));
    r.advance(1600);
    expect(r.texts()).toEqual(['meeting:we should ship it']);
  });

  it('drops mic echo when the meeting words came first, with no delay', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'we should ship it'));
    r.f.push(seg('meeting', 'a2', 7000, 'next topic'));
    r.f.push(seg('mic', 'm1', 5400, 'we should ship it'));
    expect(r.texts()).toEqual(['meeting:we should ship it', 'meeting:next topic']);
  });

  it('keeps independent user speech and shows it after at most the hold', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'we should ship it'));
    r.f.push(seg('mic', 'm1', 8000, 'actually I disagree'));
    expect(r.out).toHaveLength(1);
    r.advance(1999);
    expect(r.out).toHaveLength(1);
    r.advance(1);
    expect(r.texts()[1]).toBe('mic:actually I disagree');
  });

  it('releases early once the meeting track has moved past the echo window', () => {
    const r = rig();
    r.f.push(seg('mic', 'm1', 5000, 'hello there'));
    r.f.push(seg('meeting', 'a1', 7000, 'something else'));
    expect(r.texts()).toEqual(['meeting:something else', 'mic:hello there']);
  });

  it('never drops a single echoed word, or a repeated phrase far from the meeting', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'yes'));
    r.f.push(seg('mic', 'm1', 5100, 'yes'));
    r.f.push(seg('mic', 'm2', 40_000, 'we should ship it'));
    r.advance(2000);
    expect(r.texts()).toEqual(['meeting:yes', 'mic:yes', 'mic:we should ship it']);
  });

  it('trims only the echoed words of a mixed segment', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it today'));
    r.f.push(seg('mic', 'm1', 4400, 'okay ship it today'));
    r.advance(2000);
    const mic = r.out.find((s) => s.track === 'mic')!;
    expect(mic.text).toBe('okay');
    expect(mic.startMs).toBe(mic.words[0]!.startMs);
  });

  it('catches a run that spans two mic segments, never the first word alone', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it today folks'));
    r.f.push(seg('mic', 'm1', 5300, 'ship it'));
    r.f.push(seg('mic', 'm2', 5900, 'today folks'));
    r.advance(2000);
    expect(r.texts()).toEqual(['meeting:ship it today folks']);
  });

  it('keeps mic order and flushes on stop', () => {
    const r = rig();
    r.f.push(seg('mic', 'm1', 1000, 'one two'));
    r.f.push(seg('mic', 'm2', 3000, 'three four'));
    r.f.flush();
    expect(r.out.map((s) => s.id)).toEqual(['m1', 'm2']);
  });

  it('keeps holding while meeting coverage is past the segment end but inside the echo window', () => {
    const r = rig();
    r.f.push(seg('mic', 'm1', 5700, 'ship it')); // ends 6250
    r.f.push(seg('meeting', 'a0', 6300, 'hello there')); // head 6850 < 6250 + 1000
    r.advance(500);
    expect(r.texts()).toEqual(['meeting:hello there']);
    r.f.push(seg('meeting', 'a1', 5400, 'ship it')); // late match
    r.advance(1500);
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
  });

  it('drops a two-word echo that arrives as two one-word mic segments', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it'));
    r.f.push(seg('meeting', 'a9', 9000, 'later'));
    r.f.push(seg('mic', 'm1', 5100, 'ship'));
    r.f.push(seg('mic', 'm2', 5400, 'it'));
    r.advance(2000);
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
  });

  it('shows a lone matching word after the hold when no second word follows', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it'));
    r.f.push(seg('meeting', 'a9', 9000, 'later'));
    r.f.push(seg('mic', 'm1', 5100, 'ship'));
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
    r.advance(2000);
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual(['mic:ship']);
  });

  it('matches two one-word mic segments 100 ms apart when the first reaches its deadline', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it')); // head 5550: not past 5350 + 1000
    r.f.push(seg('mic', 'm1', 5100, 'ship'));
    r.advance(100);
    r.f.push(seg('mic', 'm2', 5400, 'it'));
    r.advance(1900); // first deadline; the second has waited only 1.9 s
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
    r.advance(500);
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
  });

  it('does not publish a newer queued segment early when resolving an older carried word', () => {
    const r = rig();
    r.f.push(seg('meeting', 'a1', 5000, 'ship it'));
    r.f.push(seg('mic', 'm1', 5100, 'ship'));
    r.advance(1900);
    r.f.push(seg('mic', 'm2', 5400, 'it and then I disagree')); // 'it' echoes, the rest is the user
    r.advance(100); // m1 deadline: echo word dropped, m2 must keep waiting
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
    r.advance(1800);
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual([]);
    r.advance(100); // m2 own deadline
    expect(r.texts().filter((t) => t.startsWith('mic'))).toEqual(['mic:and then I disagree']);
  });
});
