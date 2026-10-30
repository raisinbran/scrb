import { readdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CorruptFileError, UnsupportedVersionError } from '../src/errors.ts';
import { MEETING_FORMAT } from '../src/formats/meeting.ts';
import { mergeRegeneratedSummary, SUMMARY_FORMAT, type SummaryFile } from '../src/formats/summary.ts';
import { emptyTranscript, TRANSCRIPT_FORMAT } from '../src/formats/transcript.ts';
import { upgradeDocument } from '../src/formats/versioned.ts';
import { meetingFolderName } from '../src/layout.ts';
import { Library } from '../src/library.ts';
import { resolveDisplay } from '../src/corrections.ts';
import { tempDir, words } from './helpers.ts';

const transcriptV1 = {
  schemaVersion: 1,
  meetingId: 'm',
  speakers: [{ id: 'a', label: 'Speaker 1' }],
  segments: [
    { id: 's', speakerId: 'a', track: 'meeting', pass: 'final', words: words('hello world', 0) },
  ],
};

const summaryV1 = {
  schemaVersion: 1,
  meetingId: 'm',
  length: 'brief',
  body: 'We agreed to ship.',
  actionItems: [
    { id: 'a1', action: 'Ship', owner: 'Not specified', deadline: 'Friday', status: 'open', sourceMs: 5 },
  ],
  decisions: [
    { id: 'd1', decision: 'Ship', status: 'decided', impactArea: 'schedule', sourceMs: 5 },
  ],
};

async function libraryWithMeeting(): Promise<{ library: Library; id: string; root: string }> {
  const root = await tempDir();
  const library = await Library.open({ root });
  const { id } = await library.createMeeting({ title: 'Sync', date: '2026-10-28' });
  return { library, id, root };
}

describe('file format upgrades', () => {
  it('has an upgrade for every older version', () => {
    for (const format of [TRANSCRIPT_FORMAT, SUMMARY_FORMAT, MEETING_FORMAT]) {
      for (let version = 1; version < format.version; version += 1) {
        expect(format.upgrades[version], `${format.name} v${version}`).toBeTypeOf('function');
      }
    }
  });

  it('upgrades transcript v1 and keeps every word', () => {
    const upgraded = upgradeDocument(TRANSCRIPT_FORMAT, structuredClone(transcriptV1));
    expect(upgraded.schemaVersion).toBe(2);
    expect(upgraded.corrections).toEqual([]);
    expect(upgraded.speakers[0]).toMatchObject({ name: null, userNamed: false, mergedInto: null });
    expect(resolveDisplay(upgraded)[0]?.tokens.map((t) => t.text)).toEqual(['hello', 'world']);
  });

  it('upgrades summary v1 into the matching length and keeps its tables', () => {
    const upgraded = upgradeDocument(SUMMARY_FORMAT, structuredClone(summaryV1));
    expect(upgraded.brief).toEqual({ text: 'We agreed to ship.', edited: false });
    expect(upgraded.full).toBeNull();
    expect(upgraded.outdated).toBe(false);
    expect(upgraded.actionItems[0]?.edited).toBe(false);
    expect(upgraded.decisions).toHaveLength(1);
  });

  it('reads an old file, leaves it alone, and keeps a backup when saving over it', async () => {
    const { library, id } = await libraryWithMeeting();
    const file = library.meetingPaths(id).transcript;
    const old = JSON.stringify(transcriptV1);
    await writeFile(file, old);
    const read = await library.readTranscript(id);
    expect(read.schemaVersion).toBe(2);
    expect(await readFile(file, 'utf8')).toBe(old);

    await library.renameSpeaker(id, 'a', 'Alice');
    const saved = JSON.parse(await readFile(file, 'utf8')) as { schemaVersion: number };
    expect(saved.schemaVersion).toBe(2);
    expect(await readFile(`${file}.v1.bak`, 'utf8')).toBe(old);
    await library.close();
  });

  it('refuses a newer version and a corrupt file, and never overwrites either', async () => {
    const { library, id } = await libraryWithMeeting();
    const file = library.meetingPaths(id).transcript;
    const future = JSON.stringify({ ...emptyTranscript(id), schemaVersion: 99 });
    await writeFile(file, future);
    await expect(library.readTranscript(id)).rejects.toBeInstanceOf(UnsupportedVersionError);
    await expect(library.renameSpeaker(id, 'a', 'x')).rejects.toBeInstanceOf(UnsupportedVersionError);
    expect(await readFile(file, 'utf8')).toBe(future);

    await writeFile(file, '{"schemaVersion":2,"meetingId"');
    await expect(library.readTranscript(id)).rejects.toBeInstanceOf(CorruptFileError);
    await expect(library.renameSpeaker(id, 'a', 'x')).rejects.toBeInstanceOf(CorruptFileError);
    expect(await readFile(file, 'utf8')).toBe('{"schemaVersion":2,"meetingId"');
    await library.close();
  });

  it('rejects structurally wrong documents as corrupt', async () => {
    const { library, id } = await libraryWithMeeting();
    const file = library.meetingPaths(id).transcript;
    for (const bad of [
      '[]',
      '{}',
      JSON.stringify({ ...emptyTranscript(id), segments: 'x' }),
      JSON.stringify({ ...emptyTranscript(id), segments: [{ id: 's', speakerId: 'a', words: [{}] }] }),
      JSON.stringify({ ...emptyTranscript(id), corrections: [{ replacement: 'x', wordIds: [] }] }),
    ]) {
      await writeFile(file, bad);
      await expect(library.readTranscript(id)).rejects.toBeInstanceOf(CorruptFileError);
    }
    await library.close();
  });
});

describe('summary regeneration', () => {
  const base: SummaryFile = {
    schemaVersion: 2,
    meetingId: 'm',
    revision: 3,
    transcriptRevision: 1,
    outdated: true,
    brief: { text: 'mine', edited: true },
    full: { text: 'old full', edited: false },
    actionItems: [
      { id: 'a', action: 'edited', owner: 'x', deadline: 'y', status: 'open', sourceMs: 1, edited: true },
      { id: 'b', action: 'stale', owner: 'x', deadline: 'y', status: 'open', sourceMs: 1, edited: false },
    ],
    decisions: [],
    openQuestions: [],
  };

  it('keeps edited items and takes everything else from the new run', () => {
    const merged = mergeRegeneratedSummary(base, {
      ...base,
      brief: { text: 'new', edited: false },
      full: { text: 'new full', edited: false },
      actionItems: [
        { ...base.actionItems[0]!, action: 'model rewrite', edited: false },
        { id: 'c', action: 'fresh', owner: 'x', deadline: 'y', status: 'open', sourceMs: 2, edited: false },
      ],
    });
    expect(merged.brief?.text).toBe('mine');
    expect(merged.full?.text).toBe('new full');
    expect(merged.actionItems.map((item) => item.action)).toEqual(['edited', 'fresh']);
  });

  it('a transcript edit flags the summary; regenerating clears it and keeps edits', async () => {
    const { library, id } = await libraryWithMeeting();
    const generated = {
      brief: { text: 'first', edited: false },
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
    };
    await library.appendSegments(
      id,
      [{ id: 's', speakerId: 'a', track: 'meeting', pass: 'final', words: words('hi', 0) }],
      [{ id: 'a', label: 'S', name: null, profileId: null, userNamed: false, mergedInto: null }],
    );
    await library.saveGeneratedSummary(id, generated);
    expect((await library.readSummary(id))?.outdated).toBe(false);
    await library.updateSummary(id, (s) => ({ ...s, brief: { text: 'edited', edited: true } }));

    await library.renameSpeaker(id, 'a', 'Alice');
    expect((await library.readSummary(id))?.outdated).toBe(true);

    await library.saveGeneratedSummary(id, { ...generated, brief: { text: 'second', edited: false } });
    const after = await library.readSummary(id);
    expect(after).toMatchObject({ outdated: false, brief: { text: 'edited' }, transcriptRevision: 2 });
    await library.close();
  });
});

describe('meeting folder names', () => {
  it.each([
    ['Project sync', '2026-10-28 Project sync'],
    ['a/b\\c:d*e?f"g<h>i|j', '2026-10-28 a b c d e f g h i j'],
    ['trailing dots...  ', '2026-10-28 trailing dots'],
    ['..', '2026-10-28 Meeting'],
    ['CON', '2026-10-28 Meeting'],
    ['', '2026-10-28 Meeting'],
    ['x'.repeat(300), `2026-10-28 ${'x'.repeat(80)}`],
  ])('%s', (title, expected) => {
    expect(meetingFolderName('2026-10-28T09:00:00.000Z', title)).toBe(expected);
  });

  it('two meetings with one name get separate folders', async () => {
    const { library, root } = await libraryWithMeeting();
    await library.createMeeting({ title: 'Sync', date: '2026-10-28' });
    expect((await readdir(`${root}/meetings`)).sort()).toEqual([
      '2026-10-28 Sync',
      '2026-10-28 Sync (2)',
    ]);
    await library.close();
  });
});
