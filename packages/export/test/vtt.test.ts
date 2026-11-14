import { describe, expect, it } from 'vitest';
import { formatVttTime, renderVtt, type ExportMeeting } from '../src/index.js';

// All names and text are invented.

interface ParsedCue {
  startMs: number;
  endMs: number;
  lines: string[];
}

const TIME = /^(\d{2,}):([0-5]\d):([0-5]\d)\.(\d{3})$/;
const toMs = (stamp: string): number => {
  const m = TIME.exec(stamp);
  if (!m) throw new Error(`bad timestamp ${stamp}`);
  return (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 + Number(m[4]);
};

/** Strict WebVTT checks for the subset this exporter writes. */
function parseStrict(file: string): ParsedCue[] {
  expect(file.startsWith('WEBVTT\n\n')).toBe(true);
  expect(file.endsWith('\n')).toBe(true);
  expect(file).not.toContain('\r');
  const cues: ParsedCue[] = [];
  for (const block of file.slice('WEBVTT\n\n'.length).trimEnd().split('\n\n')) {
    const rows = block.split('\n');
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows[0]).toMatch(/^\d+$/);
    const [from, arrow, to, ...rest] = (rows[1] ?? '').split(' ');
    expect(arrow).toBe('-->');
    expect(rest).toEqual([]);
    cues.push({ startMs: toMs(from ?? ''), endMs: toMs(to ?? ''), lines: rows.slice(2) });
    for (const line of rows.slice(2)) {
      expect(line).not.toContain('-->');
      expect(line.trim()).not.toBe('');
      // Only our own tags may appear; any other `<` or `&` must be an entity.
      const stripped = line.replace(/&(amp|lt|gt);/g, '').replace(/<v [^<>&]+>|<\/v>/g, '');
      expect(stripped).not.toMatch(/[<>&]/);
    }
  }
  return cues;
}

const words = (text: string, startMs: number, stepMs = 300) =>
  text.split(' ').map((t, i) => ({
    text: `${i > 0 ? ' ' : ''}${t}`,
    startMs: startMs + i * stepMs,
    endMs: startMs + i * stepMs + stepMs - 50,
  }));

const meeting = (segments: ExportMeeting['segments']): ExportMeeting => ({
  title: 'Invented sync',
  startedAt: '2026-11-03T10:00:00Z',
  durationMs: 60_000,
  speakers: [
    { id: 'a', name: 'Marisol Quint' },
    { id: 'b', name: 'Tomasz <T> & Co' },
  ],
  segments,
});

describe('renderVtt', () => {
  it('formats timestamps with at least two hour digits', () => {
    expect(formatVttTime(0)).toBe('00:00:00.000');
    expect(formatVttTime(3_723_004)).toBe('01:02:03.004');
    expect(formatVttTime(100 * 3_600_000)).toBe('100:00:00.000');
    expect(formatVttTime(-5)).toBe('00:00:00.000');
  });

  it('starts a new cue at every speaker change and tags the voice', () => {
    const file = renderVtt(
      meeting([
        { speakerId: 'a', startMs: 0, parts: words('Hello there everyone', 0) },
        { speakerId: 'b', startMs: 2000, parts: words('Good morning', 2000) },
        { speakerId: 'a', startMs: 4000, parts: words('Shall we begin', 4000) },
      ]),
    );
    const cues = parseStrict(file);
    expect(cues).toHaveLength(3);
    expect(file).toContain('<v Marisol Quint>Hello there everyone</v>');
    expect(file).toContain('<v Tomasz &lt;T&gt; &amp; Co>Good morning</v>');
    expect(file.startsWith('WEBVTT\n')).toBe(true);
  });

  it('escapes markup and arrows in the text', () => {
    const file = renderVtt(
      meeting([
        { speakerId: 'a', startMs: 0, parts: [{ text: 'a<b & c --> d </v>' }] },
        { speakerId: null, startMs: 5000, parts: [{ text: 'who' }] },
      ]),
    );
    parseStrict(file);
    expect(file).toContain('a&lt;b &amp; c --&gt; d &lt;/v&gt;');
    expect(file).toContain('<v Unknown speaker>who</v>');
  });

  it('wraps long segments into cues of at most 2 lines of 42 characters', () => {
    const text = Array.from({ length: 120 }, (_, i) => `word${i}`).join(' ');
    const cues = parseStrict(
      renderVtt(meeting([{ speakerId: 'a', startMs: 0, parts: words(text, 0) }])),
    );
    expect(cues.length).toBeGreaterThan(5);
    for (const cue of cues) {
      expect(cue.lines.length).toBeLessThanOrEqual(2);
      expect(cue.endMs - cue.startMs).toBeLessThanOrEqual(7000 + 500);
      for (const line of cue.lines) {
        expect(line.replace(/<\/?v[^>]*>/g, '').length).toBeLessThanOrEqual(42);
      }
    }
  });

  it('never overlaps or reverses cues, even for overlapped speech', () => {
    const file = renderVtt(
      meeting([
        {
          speakerId: 'a',
          startMs: 1000,
          parts: words('I think the launch should move by a week', 1000),
        },
        { speakerId: 'b', startMs: 1500, parts: words('Agreed but the vendor needs notice', 1500) },
        { speakerId: 'a', startMs: 1500, parts: words('yes', 1500) },
      ]),
    );
    const cues = parseStrict(file);
    let previousEnd = 0;
    for (const cue of cues) {
      expect(cue.startMs).toBeGreaterThanOrEqual(previousEnd);
      expect(cue.endMs).toBeGreaterThan(cue.startMs);
      previousEnd = cue.endMs;
    }
    expect(file).toContain('yes');
    expect(file).toContain('vendor needs notice');
  });

  it('estimates timing when words carry none', () => {
    const cues = parseStrict(
      renderVtt(
        meeting([{ speakerId: 'a', startMs: 2000, parts: [{ text: 'one' }, { text: ' two' }] }]),
      ),
    );
    expect(cues[0]).toMatchObject({ startMs: 2000 });
    expect(cues[0]!.endMs).toBeGreaterThan(2000);
  });

  it('keeps non-ASCII text and drops voice tags when names are off', () => {
    const file = renderVtt(
      meeting([{ speakerId: 'a', startMs: 0, parts: [{ text: 'Café naïve 日本語' }] }]),
      { speakerNames: false },
    );
    parseStrict(file);
    expect(file).toContain('Café naïve 日本語');
    expect(file).not.toContain('<v');
  });

  it('splits on a long silence inside one segment', () => {
    const cues = parseStrict(
      renderVtt(
        meeting([
          {
            speakerId: 'a',
            startMs: 0,
            parts: [
              { text: 'before', startMs: 0, endMs: 400 },
              { text: ' after', startMs: 9000, endMs: 9400 },
            ],
          },
        ]),
      ),
    );
    expect(cues).toHaveLength(2);
  });

  it('writes only the header for an empty transcript', () => {
    expect(renderVtt(meeting([]))).toBe('WEBVTT\n\n');
  });
});
