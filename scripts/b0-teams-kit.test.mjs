import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { RATE, findBeeps } from './b0-track-sync.mjs';
import {
  SCRIPT,
  buildSchedule,
  composeRemote,
  cuePage,
  phaseAt,
  wav16Buffer,
} from './b0-teams-kit.mjs';

const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const tone = (seconds) =>
  Float32Array.from(
    { length: Math.round(seconds * RATE) },
    (_, i) => 0.3 * Math.sin(i * 0.31) * Math.sin(i * 0.0007),
  );

describe('schedule', () => {
  it('has the frozen 30 turns, 10 per voice, and frozen slot spacing shifted by the lead', () => {
    const s = buildSchedule(10);
    expect(s.turns).toHaveLength(30);
    for (const r of ['Y', 'A', 'B']) expect(s.turns.filter((t) => t.role === r)).toHaveLength(10);
    expect(s.turns[0]).toMatchObject({ id: 'Y01', slotS: 13.5 });
    expect(s.turns[1]).toMatchObject({ id: 'A01', slotS: 22.5 });
    expect(s.turns[29]).toMatchObject({ id: 'Y10', slotS: 10 + 3.5 + 29 * 9 });
    expect(s.endBeepS - s.startBeepS).toBeCloseTo(272.2, 5);
    expect(SCRIPT[13]).toEqual(['A', 'A red suitcase rolled across the station.']);
  });
});

describe('composeRemote', () => {
  const s = buildSchedule(10);
  const samples = new Map(s.turns.filter((t) => t.role !== 'Y').map((t) => [t.k, tone(2)]));
  it('places the beeps where the sync tool looks and keeps Y slots silent', () => {
    const { samples: out } = composeRemote(s, samples);
    const found = findBeeps(out);
    expect(found).toHaveLength(2);
    expect(found[0]).toBeCloseTo(11.8, 1);
    expect(found[1]).toBeCloseTo(284, 1);
    const y = s.turns[0].slotS * RATE;
    expect(peak(out.subarray(y, y + 7 * RATE))).toBe(0);
    const a = s.turns[1].slotS * RATE;
    expect(peak(out.subarray(a, a + 2 * RATE))).toBeCloseTo(0.5, 1);
  });
  it('refuses a turn over 7.5 s', () => {
    const long = new Map(samples).set(2, tone(7.6));
    expect(() => composeRemote(s, long)).toThrow(/7\.5 s/);
  });
  it('writes a 16 kHz mono WAV header', () => {
    const b = wav16Buffer(new Float32Array(160));
    expect(b.readUInt32LE(24)).toBe(16000);
    expect(b.length).toBe(44 + 320);
  });
});

describe('phaseAt', () => {
  const s = buildSchedule(10);
  it('is idle, quiet in beep windows, and done after the end beep', () => {
    expect(phaseAt(s, -1).phase).toBe('idle');
    expect(phaseAt(s, 0).phase).toBe('quiet');
    expect(phaseAt(s, s.startBeepS).phase).toBe('quiet');
    expect(phaseAt(s, s.endBeepS).phase).toBe('quiet');
    expect(phaseAt(s, s.endBeepS + 2).finishing).toBe(true);
    expect(phaseAt(s, s.endBeepS + 3.1).phase).toBe('done');
  });
  it('is quiet with no next line between the last Y turn and the end-beep window', () => {
    for (const t of [282.0, 282.5, 283.0, 283.4]) {
      const p = phaseAt(s, t);
      expect(p.phase).toBe('quiet');
      expect(p.next).toBeNull();
    }
  });
  it('shows ready then your turn for Y01, with the next line', () => {
    const r = phaseAt(s, 13.0);
    expect(r.phase).toBe('ready');
    expect(r.next.line).toBe('A copper lantern marks the quiet doorway.');
    const n = phaseAt(s, 14);
    expect(n.phase).toBe('now');
    expect(n.current.id).toBe('Y01');
    expect(n.remainingS).toBeCloseTo(7, 5);
    expect(n.after.line).toBe('Morning sunlight crossed the wooden table.');
  });
  it('waits during a remote slot and names the next Y line', () => {
    const w = phaseAt(s, 23);
    expect(w.phase).toBe('wait');
    expect(w.next.id).toBe('Y02');
    expect(w.untilS).toBeCloseTo(s.turns[4].slotS - 23, 5);
  });
  it('covers every Y turn exactly once as "now" and never overlaps a quiet window', () => {
    for (const y of s.turns.filter((t) => t.role === 'Y')) {
      expect(phaseAt(s, y.slotS + 0.5).current.id).toBe(y.id);
      expect(phaseAt(s, y.slotS + 6.9).current.id).toBe(y.id);
    }
  });
});

describe('cuePage', () => {
  it('renders every second of the run without throwing', () => {
    const html = cuePage(buildSchedule(10), 'data:audio/mp4;base64,AAAA');
    const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
    const els = {};
    const doc = {
      body: { className: '' },
      getElementById: (id) => (els[id] ??= { textContent: '', style: {} }),
    };
    const ctx = vm.createContext({
      document: doc,
      navigator: {},
      performance: { now: () => 0 },
      requestAnimationFrame() {},
    });
    vm.runInContext(`${script};this.render=render`, ctx);
    for (let t = 0; t < 290; t += 0.5) ctx.render(t);
    ctx.render(282.5);
    expect(doc.body.className).toBe('quiet');
  });
  it('is self-contained, embeds the schedule and the phase function, with no network references', () => {
    const html = cuePage(buildSchedule(10), 'data:audio/mp4;base64,AAAA');
    expect(html).toContain('data:audio/mp4;base64,AAAA');
    expect(html).toContain('A copper lantern marks the quiet doorway.');
    expect(html).toContain('function phaseAt');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('__');
    new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
  });
});
