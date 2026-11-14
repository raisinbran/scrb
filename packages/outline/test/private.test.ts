import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { alignNotes } from '../eval/private/align.js';
import {
  listPrivateMeetings,
  loadPrivateMeeting,
  parseTranscript,
  splitNotes,
} from '../eval/private/load.js';
import { parseOutline } from '../src/parse.js';

// Invented data only.
const fixtures = fileURLToPath(new URL('./fixtures/private-sample', import.meta.url));
const pkg = fileURLToPath(new URL('..', import.meta.url));

describe('parseTranscript', () => {
  it('reads times and speakers, and spaces untimed lines apart', () => {
    const w = parseTranscript('[00:10] Ann: one two three\n[00:20] Bob: four five\nsix seven');
    expect(w.map((x) => x.text)).toEqual(['one', 'two', 'three', 'four', 'five', 'six', 'seven']);
    expect(w[0]).toMatchObject({ speaker: 'Ann', startMs: 10_000 });
    expect(w[3]).toMatchObject({ speaker: 'Bob', startMs: 20_000 });
    expect(w[5]!.speaker).toBe('S');
    expect(w[5]!.startMs - w[4]!.endMs).toBeGreaterThanOrEqual(2000);
    expect(w.every((x, i) => i === 0 || x.startMs >= w[i - 1]!.endMs)).toBe(true);
  });
  it('treats plain text as one speaker with synthetic times', () => {
    const w = parseTranscript('alpha beta\n\ngamma');
    expect(w).toHaveLength(3);
    expect(new Set(w.map((x) => x.speaker))).toEqual(new Set(['S']));
  });
  it('empty text gives no words', () => expect(parseTranscript(' \n ')).toEqual([]));
});

describe('splitNotes', () => {
  const items = parseOutline('1. Budget review\n2. Hiring plan\n3. Launch date').items;
  it('files bodies under matching headings, tolerating markup and extra words', () => {
    const b = splitNotes(
      '# Title\nintro line\n**Budget review (final)**\n- spend up\n2. Hiring plan:\n- two hires\nLaunch date\nApril',
      items,
    );
    expect(b[0]).toBe('spend up');
    expect(b[1]).toBe('two hires');
    expect(b[2]).toBe('April');
  });
  it('leaves an item null when its heading is missing, and ignores bullets that repeat a heading', () => {
    const b = splitNotes('## Budget review\n- Hiring plan\n- text\n## Launch date\nx', items);
    expect(b[1]).toBeNull();
    expect(b[0]).toBe('Hiring plan\ntext');
    expect(b[2]).toBe('x');
  });
});

describe('alignNotes', () => {
  it('labels each part of a meeting with its notes section, in order', () => {
    const r = loadPrivateMeeting(join(fixtures, 'meeting-a'));
    if (!r.ok) throw new Error('fixture');
    const al = alignNotes(r.meeting.words, r.meeting.bodies);
    expect(al.alignedItems).toBe(3);
    const labels = al.blocks.map((b) => al.wordItem[b.first]);
    expect(labels).toEqual([0, 0, 0, 1, 1, 2, 2]);
  });
  it('survives typos and a mis-heard word', () => {
    const r = loadPrivateMeeting(join(fixtures, 'meeting-a'));
    if (!r.ok) throw new Error('fixture');
    const noisy = parseTranscript(
      'Pat: ok lets start with the budjet the quarterly spend on cloud hostin is over forecast by ten percent\n' +
        'Sam: now hirring we need two enginers and one desinger so the headcout request goes to finnance\n' +
        'Pat: finally the lunch date we pick the fifteenth of april pending the securty audit and testin sign off',
    );
    const al = alignNotes(noisy, r.meeting.bodies);
    expect(al.blocks.map((b) => al.wordItem[b.first])).toEqual([0, 1, 2]);
  });
  it('labels nothing when no section has enough text', () => {
    const al = alignNotes(parseTranscript('a b c d e f'), [null, 'x', null]);
    expect(al.wordItem.every((x) => x === null)).toBe(true);
  });
});

describe('loader', () => {
  it('lists folders by name and loads or skips with a code', () => {
    expect(listPrivateMeetings(fixtures)).toEqual(['meeting-a', 'meeting-b']);
    expect(loadPrivateMeeting(join(fixtures, 'meeting-a')).ok).toBe(true);
    expect(loadPrivateMeeting(join(fixtures, 'nope'))).toEqual({ ok: false, code: 'noOutline' });
  });
});

describe('runner', () => {
  const run = (...args: string[]) =>
    spawnSync(join(pkg, '../../node_modules/.bin/tsx'), ['eval/private/run.ts', ...args], {
      cwd: pkg,
      encoding: 'utf8',
    });
  it('prints numbers only and writes outside the repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outline-private-'));
    try {
      const out = join(dir, 'r.txt');
      const r = run(fixtures, out);
      expect(r.status).toBe(0);
      const text = readFileSync(out, 'utf8');
      expect(r.stdout).toBe(text);
      expect(text).toContain('meeting 1:');
      expect(text).toContain('meeting 2: skipped (fewer than 2 outline items aligned');
      for (const leak of ['budget', 'Budget', 'hosting', 'meeting-a', 'Pat', 'Sam', 'fixtures'])
        expect(text).not.toContain(leak);
      expect(text).toMatch(/Overall: 1 meetings scored, 1 skipped/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('refuses an output file inside the repo', () => {
    const r = run(fixtures, join(pkg, 'results.txt'));
    expect(r.status).toBe(1);
    expect(
      execFileSync('git', ['status', '--short', 'results.txt'], { cwd: pkg, encoding: 'utf8' }),
    ).toBe('');
  });
});
