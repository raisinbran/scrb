import { readdir, readFile, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { CorruptFileError, UnsupportedVersionError } from '../src/errors.ts';
import { MEETING_FORMAT } from '../src/formats/meeting.ts';
import {
  mergeRegeneratedSummary,
  SUMMARY_FORMAT,
  type ActionItem,
  type OpenQuestion,
  type SummaryBody,
  type SummaryFile,
} from '../src/formats/summary.ts';
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
    expect(upgraded.brief?.sections).toEqual([
      { id: 'brief-0', heading: null, text: 'We agreed to ship.', edited: false },
    ]);
    expect(upgraded.full).toBeNull();
    expect(upgraded.outdated).toBe(false);
    expect(upgraded.actionItems[0]?.edited).toBe(false);
    expect(upgraded.decisions).toHaveLength(1);
  });

  it('upgrades summary v2: named sections, question objects, unknown details as flags', () => {
    const upgraded = upgradeDocument(SUMMARY_FORMAT, {
      schemaVersion: 2,
      meetingId: 'm',
      revision: 4,
      transcriptRevision: 2,
      outdated: false,
      brief: null,
      full: { text: 'Long text', edited: true },
      actionItems: [
        { id: 'a', action: 'Ship', owner: 'Unconfirmed', deadline: 'Not specified', status: 'Agreed', sourceMs: 5, edited: true },
        { id: 'b', action: 'Test', owner: 'Ana', deadline: 'Friday', status: 'Open', sourceMs: 6, edited: false },
      ],
      decisions: [
        { id: 'd', decision: 'Ship', status: 'tentatively agreed', impactArea: 'technical approach', sourceMs: 5, edited: false },
      ],
      openQuestions: ['Who owns it?'],
    });
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.generatedAt).toBeNull();
    expect(upgraded.warnings).toEqual([]);
    expect(upgraded.full?.sections).toEqual([
      { id: 'full-0', heading: null, text: 'Long text', edited: true },
    ]);
    expect(upgraded.actionItems[0]).toEqual({
      id: 'a',
      action: 'Ship',
      owner: null,
      ownerUnconfirmed: true,
      deadline: null,
      deadlineUnconfirmed: false,
      status: 'agreed',
      sourceMs: 5,
      alsoAtMs: [],
      needsReview: false,
      edited: true,
    });
    expect(upgraded.actionItems[1]).toMatchObject({ owner: 'Ana', status: 'unconfirmed' });
    expect(upgraded.decisions[0]).toMatchObject({
      status: 'tentativelyAgreed',
      impactArea: 'technicalApproach',
    });
    expect(upgraded.openQuestions).toEqual([
      { id: 'q-0', question: 'Who owns it?', sourceMs: null, alsoAtMs: [], needsReview: false, edited: false },
    ]);
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

function body(text: string, edited = false): SummaryBody {
  return { sections: [{ id: 's-0', heading: null, text, edited }] };
}

function action(fields: Partial<ActionItem> & { id: string; action: string }): ActionItem {
  return {
    owner: 'x',
    ownerUnconfirmed: false,
    deadline: 'y',
    deadlineUnconfirmed: false,
    status: 'agreed',
    sourceMs: 1,
    alsoAtMs: [],
    needsReview: false,
    edited: false,
    ...fields,
  };
}

function question(text: string, edited = false): OpenQuestion {
  return { id: 'q', question: text, sourceMs: null, alsoAtMs: [], needsReview: false, edited };
}

describe('summary regeneration', () => {
  const base: SummaryFile = {
    schemaVersion: 3,
    meetingId: 'm',
    revision: 3,
    transcriptRevision: 1,
    outdated: true,
    generatedAt: null,
    brief: body('mine', true),
    full: body('old full'),
    actionItems: [
      action({ id: 'a', action: 'edited', edited: true }),
      action({ id: 'b', action: 'stale' }),
    ],
    decisions: [],
    openQuestions: [question('kept', true)],
    warnings: [],
  };

  it('keeps edited items and takes everything else from the new run', () => {
    const merged = mergeRegeneratedSummary(base, {
      ...base,
      brief: body('new'),
      full: body('new full'),
      actionItems: [
        { ...base.actionItems[0]!, action: 'model rewrite', edited: false },
        action({ id: 'c', action: 'fresh' }),
      ],
      openQuestions: [question('replaced by the edit')],
    });
    expect(merged.brief?.sections[0]?.text).toBe('mine');
    expect(merged.full?.sections[0]?.text).toBe('new full');
    expect(merged.actionItems.map((item) => item.action)).toEqual(['edited', 'fresh']);
    expect(merged.openQuestions.map((item) => item.question)).toEqual(['kept']);
  });

  it('a transcript edit flags the summary; regenerating clears it and keeps edits', async () => {
    const { library, id } = await libraryWithMeeting();
    const generated = {
      generatedAt: null,
      brief: body('first'),
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    };
    await library.appendSegments(
      id,
      [{ id: 's', speakerId: 'a', track: 'meeting', pass: 'final', words: words('hi', 0) }],
      [{ id: 'a', label: 'S', name: null, profileId: null, userNamed: false, mergedInto: null }],
    );
    await library.saveGeneratedSummary(id, generated);
    expect((await library.readSummary(id))?.outdated).toBe(false);
    await library.updateSummary(id, (s) => ({ ...s, brief: body('edited', true) }));

    await library.renameSpeaker(id, 'a', 'Alice');
    expect((await library.readSummary(id))?.outdated).toBe(true);

    await library.saveGeneratedSummary(id, { ...generated, brief: body('second') });
    const after = await library.readSummary(id);
    expect(after).toMatchObject({ outdated: false, transcriptRevision: 2 });
    expect(after?.brief?.sections[0]?.text).toBe('edited');
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
