import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveDisplay } from '../src/corrections.ts';
import { MeetingNotFoundError, StaleRevisionError } from '../src/errors.ts';
import type { TranscriptFile } from '../src/formats/transcript.ts';
import { Library, readLibraryLocation, writeLibraryLocation } from '../src/library.ts';
import { Logger } from '../src/logs.ts';
import { foldText } from '../src/search.ts';
import { segment, speaker, tempDir, words } from './helpers.ts';

const shown = (t: TranscriptFile): string =>
  resolveDisplay(t)
    .flatMap((s) => s.tokens.map((token) => token.text))
    .join(' ');

async function seeded(
  library: Library,
  title = 'Sync',
  text = 'we should ask jon smith about the budget before friday',
  date = '2026-10-28',
): Promise<{ id: string; ids: string[] }> {
  const { id } = await library.createMeeting({ title, date });
  const list = words(text, 0);
  await library.appendSegments(id, [segment('s1', 'a', list)], [speaker('a')]);
  return { id, ids: list.map((word) => word.id) };
}

// chmod cannot make a folder read-only on Windows; those failure paths are checked on the Mac.
const itPosix = it.skipIf(process.platform === 'win32');

describe('crash during save', () => {
  it.each(['temp-created', 'temp-partly-written', 'temp-synced'] as const)(
    'a crash at %s keeps the last saved transcript with its corrections',
    async (step) => {
      const root = await tempDir();
      const library = await Library.open({ root });
      const { id, ids } = await seeded(library);
      const saved = await library.applyCorrection(id, {
        wordIds: ids.slice(3, 5),
        replacement: 'John Smythe',
      });

      const crash = (at: string): void => {
        if (at === step) throw new Error('simulated crash');
      };
      const doomed = { ...saved, speakers: [] };
      await expect(
        library.saveTranscript(id, doomed, saved.revision, { onStep: crash }),
      ).rejects.toThrow('simulated crash');
      await library.close();

      const reopened = await Library.open({ root });
      const read = await reopened.readTranscript(id);
      expect(shown(read)).toContain('John Smythe');
      expect(read.speakers).toHaveLength(1);
      const names = await readdir(reopened.meetingPaths(id).folder);
      expect(names.filter((name) => name.includes('.tmp-'))).toEqual([]);
      await reopened.close();
    },
  );
});

describe('corrections through the library', () => {
  it('survive restarts and a final pass, 100%', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id, ids } = await seeded(library);
    await library.applyCorrection(id, { wordIds: ids.slice(3, 5), replacement: 'John Smythe' });
    await library.close();

    library = await Library.open({ root });
    const final = await library.applyFinalPass(id, {
      segments: [
        segment('f', 'F', words('we should ask john smit about the budget', 100, 'f'), 'final'),
      ],
      speakers: [speaker('F')],
    });
    await library.close();

    library = await Library.open({ root });
    const read = await library.readTranscript(id);
    expect(read).toEqual(final);
    expect(shown(read)).toBe('we should ask John Smythe about the budget');
    await library.close();
  });

  it('a correction made while the final pass runs is kept', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, ids } = await seeded(library);
    const edit = library.applyCorrection(id, { wordIds: ids.slice(0, 1), replacement: 'We' });
    const final = library.applyFinalPass(id, {
      segments: [segment('f', 'F', words('we should ask john', 0, 'f'), 'final')],
      speakers: [speaker('F')],
    });
    const [, result] = await Promise.all([edit, final]);
    expect(shown(result)).toBe('We should ask john');
    await library.close();
  });

  it('refuses a whole-file save from a stale copy', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, ids } = await seeded(library);
    const stale = await library.readTranscript(id);
    await library.applyCorrection(id, { wordIds: ids.slice(0, 1), replacement: 'We' });
    await expect(library.saveTranscript(id, stale, stale.revision)).rejects.toBeInstanceOf(
      StaleRevisionError,
    );
    expect((await library.readTranscript(id)).corrections).toHaveLength(1);
    await library.close();
  });

  it('Remember correction feeds the vocabulary and follows undo and redo', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, ids } = await seeded(library);
    await library.applyCorrection(id, {
      wordIds: ids.slice(3, 5),
      replacement: 'John Smythe',
      remember: true,
    });
    const [term] = library.vocabulary.list();
    expect(term).toMatchObject({ term: 'John Smythe', misheard: ['jon smith'] });
    expect(await library.vocabularyContext(term!.contexts[0]!, 2)).toEqual({
      before: 'should ask',
      after: 'about the',
    });

    await library.undo(id);
    expect(library.vocabulary.list()).toEqual([]);
    await library.redo(id);
    expect(library.vocabulary.list()).toHaveLength(1);
    await library.close();
  });
});

describe('vocabulary crash repair', () => {
  it('keeps no readable copy of a deleted term', async () => {
    const library = await Library.open({ root: await tempDir() });
    const term = library.vocabulary.remember({ term: 'Secret Project' });
    library.vocabulary.delete(term.id);
    expect(JSON.stringify(library.settings.all()).toLowerCase()).not.toContain('secret');
    await library.close();
  });

  it('reconciles a missing link once and respects a deleted term', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id, ids } = await seeded(library);
    await library.applyCorrection(id, {
      wordIds: ids.slice(3, 5),
      replacement: 'John Smythe',
      remember: true,
    });
    const original = library.vocabulary.list()[0]!;
    library.vocabulary.forgetCorrection(original.contexts[0]!.correctionId, 'jon smith');
    library.settings.set(`vocabulary.pending.${id}`, true);
    await library.close();
    library = await Library.open({ root });
    expect(library.vocabulary.list()).toHaveLength(1);
    const remembered = library.vocabulary.list()[0]!;
    library.vocabulary.delete(remembered.id);
    library.settings.set(`vocabulary.pending.${id}`, true);
    await library.close();
    library = await Library.open({ root });
    expect(library.vocabulary.list()).toEqual([]);
    await library.close();
  });

  it('leaves a deliberately disabled term disabled during reconciliation', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id, ids } = await seeded(library);
    await library.applyCorrection(id, {
      wordIds: ids.slice(3, 5),
      replacement: 'John Smythe',
      remember: true,
    });
    const term = library.vocabulary.list()[0]!;
    library.vocabulary.update(term.id, { enabled: false });
    library.settings.set(`vocabulary.pending.${id}`, true);
    await library.close();
    library = await Library.open({ root });
    expect(library.vocabulary.list()[0]?.enabled).toBe(false);
    await library.close();
  });
});

describe('index stays secondary', () => {
  it('never writes transcript text into the index', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id, ids } = await seeded(library, 'Sync', 'zebrafish quartermaster tangerine');
    await library.applyCorrection(id, {
      wordIds: ids.slice(0, 1),
      replacement: 'kiwi',
      remember: true,
    });
    await library.close();
    const bytes = await readFile(path.join(root, 'index.sqlite'), 'latin1');
    expect(bytes).not.toContain('quartermaster');
    expect(bytes).not.toContain('tangerine');
  });

  it('rebuilds a lost index from the folders', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id } = await seeded(library, 'Keep me');
    await library.close();
    await rm(path.join(root, 'index.sqlite'));

    library = await Library.open({ root });
    expect(library.openReport.added).toEqual([id]);
    expect(library.listMeetings()[0]).toMatchObject({ id, title: 'Keep me' });
    await library.close();
  });

  it('repairs disagreements and keeps what it cannot read', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id } = await seeded(library, 'One');
    const { id: gone } = await seeded(library, 'Two');
    const meetingFile = library.meetingPaths(id).meta;
    const goneFolder = library.meetingPaths(gone).folder;
    await library.close();

    const meta = JSON.parse(await readFile(meetingFile, 'utf8')) as Record<string, unknown>;
    await writeFile(meetingFile, JSON.stringify({ ...meta, title: 'Edited on disk' }));
    await rm(goneFolder, { recursive: true });
    const stray = path.join(root, 'meetings', 'someone elses folder');
    await mkdir(path.join(stray, 'audio'), { recursive: true });
    await writeFile(path.join(stray, 'audio', 'clip.opus'), 'audio');
    await mkdir(path.join(root, 'meetings', 'empty leftover', 'audio'), { recursive: true });

    library = await Library.open({ root });
    expect(library.openReport).toMatchObject({
      updated: [id],
      removed: [gone],
      unreadableFolders: ['someone elses folder'],
    });
    expect(library.listMeetings().map((row) => row.title)).toEqual(['Edited on disk']);
    expect(await readFile(path.join(stray, 'audio', 'clip.opus'), 'utf8')).toBe('audio');
    expect(await readdir(path.join(root, 'meetings'))).not.toContain('empty leftover');
    await library.close();
  });

  it('follows a folder the user renamed, and survives moving the library', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id } = await seeded(library, 'Old name');
    const folder = library.meetingPaths(id).folder;
    await library.close();
    await rename(folder, path.join(root, 'meetings', 'New name'));
    const moved = path.join(await tempDir(), 'elsewhere');
    await rename(root, moved);

    library = await Library.open({ root: moved });
    expect(library.meetingPaths(id).folder).toBe(path.join(moved, 'meetings', 'New name'));
    expect(shown(await library.readTranscript(id))).toContain('budget');
    await library.close();
  });

  it('an interrupted import leaves nothing; an interrupted recording is kept and reported', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const importing = await library.createMeeting({
      title: 'Upload',
      source: 'imported',
      status: 'importing',
    });
    const recording = await library.createMeeting({ title: 'Live', status: 'recording' });
    const cancelled = await library.createMeeting({
      title: 'Nope',
      source: 'imported',
      status: 'importing',
    });
    expect((await library.discardImport(cancelled.id)).ok).toBe(true);
    await library.close();

    library = await Library.open({ root });
    expect(library.openReport.discardedImports).toEqual([importing.id]);
    expect(library.openReport.interruptedRecordings).toEqual([recording.id]);
    expect(library.listMeetings().map((row) => row.id)).toEqual([recording.id]);
    await library.close();
  });

  it('reports a final pass the app quit during, and keeps a failure reason', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const running = await library.createMeeting({ title: 'Long', status: 'finalPassRunning' });
    const failed = await library.createMeeting({ title: 'Failed', status: 'ready' });
    await library.updateMeeting(failed.id, {
      status: 'transcriptionFailed',
      transcriptionFailure: 'It failed.',
    });
    await library.close();

    library = await Library.open({ root });
    expect(library.openReport.interruptedFinalPasses).toEqual([running.id]);
    expect((await library.getMeeting(failed.id)).transcriptionFailure).toBe('It failed.');
    await library.close();
  });
});

describe('delete', () => {
  it('removes folder, index entries, cache and links, and confirms it', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id, ids } = await seeded(library, 'Secret plans');
    const { id: other } = await seeded(library, 'Other');
    await library.applyCorrection(id, {
      wordIds: ids.slice(0, 1),
      replacement: 'Kiwi',
      remember: true,
    });
    const profile = library.voiceProfiles.create({
      modelId: 'm',
      embedding: new Float32Array([1, 2]),
      meetingId: id,
    });
    const files = library.meetingPaths(id);
    await writeFile(path.join(files.audioMeeting, 'chunk-0.opus'), 'audio');
    await writeFile(path.join(files.exports, 'notes.pdf'), 'pdf');
    await mkdir(path.join(root, 'cache', id));
    await writeFile(path.join(root, 'cache', id, 'peaks.bin'), 'peaks');

    expect(await library.deleteMeeting(id)).toEqual({ meetingId: id, ok: true, remaining: [] });

    expect(await readdir(path.join(root, 'meetings'))).toEqual(['2026-10-28 Other']);
    expect(await readdir(path.join(root, 'cache'))).toEqual([]);
    expect(library.listMeetings().map((row) => row.id)).toEqual([other]);
    expect(() => library.meetingPaths(id)).toThrow(MeetingNotFoundError);
    expect(library.vocabulary.list()[0]?.contexts).toEqual([]);
    expect(library.voiceProfiles.get(profile.id)?.meetingIds).toEqual([]);
    await library.close();

    const bytes = await readFile(path.join(root, 'index.sqlite'), 'latin1');
    expect(bytes).not.toContain('Secret plans');
    expect(bytes).not.toContain(id);
  });

  it('deleting a voice profile zeroes its data on disk', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const marker = new Float32Array([1234.5678, 8765.4321, 1111.2222]);
    const profile = library.voiceProfiles.create({ modelId: 'm', embedding: marker });
    const needle = Buffer.from(marker.buffer);
    expect((await readFile(path.join(root, 'index.sqlite'))).includes(needle)).toBe(true);
    library.voiceProfiles.delete(profile.id);
    await library.close();
    expect((await readFile(path.join(root, 'index.sqlite'))).includes(needle)).toBe(false);
  });

  itPosix(
    'reports failure when the folder cannot go, keeps the meeting, and a retry finishes',
    async () => {
      const root = await tempDir();
      const library = await Library.open({ root });
      const { id } = await seeded(library);
      const meetings = path.join(root, 'meetings');
      await chmod(meetings, 0o555);
      const failed = await library.deleteMeeting(id);
      await chmod(meetings, 0o755);

      expect(failed.ok).toBe(false);
      expect(failed.remaining.length).toBeGreaterThan(0);
      expect(failed.remaining).toContain('index:meetings');
      expect(library.listMeetings()).toHaveLength(1);
      expect((await library.readTranscript(id)).segments).toHaveLength(1);

      expect((await library.deleteMeeting(id)).ok).toBe(true);
      await library.close();
    },
  );

  itPosix('reports a cache file that would not go, and the next open sweeps it', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id } = await seeded(library);
    const cache = path.join(root, 'cache', id);
    await mkdir(cache);
    await writeFile(path.join(cache, 'peaks.bin'), 'x');
    await chmod(cache, 0o555);
    const report = await library.deleteMeeting(id);
    await chmod(cache, 0o755);
    expect(report.ok).toBe(false);
    expect(report.remaining).toEqual([cache]);
    await library.close();

    library = await Library.open({ root });
    expect(await readdir(path.join(root, 'cache'))).toEqual([]);
    await library.close();
  });

  it('does not verify a delete while an upgrade snapshot may retain the meeting', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id } = await seeded(library);
    const backup = path.join(root, 'index.sqlite.upgrade-synthetic');
    await writeFile(backup, await readFile(path.join(root, 'index.sqlite')));

    const report = await library.deleteMeeting(id);
    expect(report.ok).toBe(false);
    expect(report.remaining).toContain(backup);
    expect(library.listMeetings()).toEqual([]);
    await library.close();

    // The copy is retained for review, not silently removed by deletion.
    expect((await readFile(backup)).length).toBeGreaterThan(0);
    await rm(backup);
    const reopened = await Library.open({ root });
    expect(reopened.listMeetings()).toEqual([]);
    await reopened.close();
  });

  it('reports a copy of the meeting left in the library', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id } = await seeded(library);
    const copy = path.join(root, 'meetings', 'Copy of meeting');
    await mkdir(copy);
    await writeFile(path.join(copy, 'meeting.json'), await readFile(library.meetingPaths(id).meta));
    const report = await library.deleteMeeting(id);
    expect(report.ok).toBe(false);
    expect(report.remaining).toEqual([copy]);
    await library.close();
  });

  it('a crash mid-delete is finished on the next open, not resurrected', async () => {
    const root = await tempDir();
    let library = await Library.open({ root });
    const { id } = await seeded(library);
    const folder = library.meetingPaths(id).folder;
    await library.close();
    await rename(folder, path.join(root, 'meetings', `.deleting-${id}`));

    library = await Library.open({ root });
    expect(library.openReport.finishedDeletes).toEqual([id]);
    expect(library.listMeetings()).toEqual([]);
    expect(await readdir(path.join(root, 'meetings'))).toEqual([]);
    await library.close();
  });

  it('rejects an index row that points outside the library', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id } = await seeded(library);
    const db = (
      library as unknown as { db: { prepare(sql: string): { run(...a: string[]): void } } }
    ).db;
    db.prepare('UPDATE meetings SET folder = ? WHERE id = ?').run('../../etc', id);
    await expect(library.deleteMeeting(id)).rejects.toThrow('plain name');
    await library.close();
  });

  it('refuses an unknown meeting', async () => {
    const library = await Library.open({ root: await tempDir() });
    await expect(library.deleteMeeting('nope')).rejects.toBeInstanceOf(MeetingNotFoundError);
    await library.close();
  });
});

describe('auto-delete', () => {
  const DAY = 86_400_000;
  const start = Date.parse('2026-01-01T00:00:00.000Z');

  async function aged(clock: {
    t: number;
  }): Promise<{ library: Library; old: string; young: string; root: string }> {
    const root = await tempDir();
    const library = await Library.open({ root, now: () => new Date(clock.t) });
    const { id: old } = await seeded(library, 'Old');
    await writeFile(path.join(library.meetingPaths(old).audioMeeting, 'chunk.opus'), 'audio');
    clock.t += 20 * DAY;
    const { id: young } = await seeded(library, 'Young');
    await writeFile(path.join(library.meetingPaths(young).audioMicrophone, 'chunk.opus'), 'audio');
    clock.t += 10 * DAY;
    return { library, old, young, root };
  }

  it('does nothing on Never', async () => {
    const clock = { t: start };
    const { library } = await aged(clock);
    clock.t += 5000 * DAY;
    expect((await library.runAutoDelete()).results).toEqual([]);
    expect(library.listMeetings()).toHaveLength(2);
    await library.close();
  });

  it('audio only: removes exactly the old audio, once, and keeps the transcript', async () => {
    const clock = { t: start };
    const { library, old, young } = await aged(clock);
    library.settings.setAutoDelete({ period: '30d', scope: 'audio' });
    expect(library.previewAutoDelete().map((row) => row.id)).toEqual([old]);

    const run = await library.runAutoDelete();
    expect(run.results).toEqual([{ meetingId: old, ok: true, remaining: [] }]);
    const files = library.meetingPaths(old);
    await expect(readdir(files.audio)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(shown(await library.readTranscript(old))).toContain('budget');
    expect((await library.getMeeting(old)).audioDeletedAt).not.toBeNull();
    expect(await readdir(library.meetingPaths(young).audioMicrophone)).toEqual(['chunk.opus']);
    expect((await library.runAutoDelete()).results).toEqual([]);
    await library.close();
  });

  it('whole meeting: removes exactly the old meeting', async () => {
    const clock = { t: start };
    const { library, young } = await aged(clock);
    library.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    const run = await library.runAutoDelete();
    expect(run.results.every((result) => result.ok)).toBe(true);
    expect(library.listMeetings().map((row) => row.id)).toEqual([young]);
    await library.close();
  });

  it.each([
    ['30d', 30],
    ['90d', 90],
    ['180d', 180],
    ['1y', 365],
  ] as const)('%s fires at the boundary and not a moment before', async (period, days) => {
    const clock = { t: start };
    const library = await Library.open({ root: await tempDir(), now: () => new Date(clock.t) });
    await seeded(library);
    library.settings.setAutoDelete({ period, scope: 'meeting' });
    clock.t = start + days * DAY - 1;
    expect(library.previewAutoDelete()).toEqual([]);
    clock.t = start + days * DAY;
    expect(library.previewAutoDelete()).toHaveLength(1);
    await library.close();
  });

  it('counts from when an import arrived, not the old date on the file', async () => {
    const clock = { t: start };
    const library = await Library.open({ root: await tempDir(), now: () => new Date(clock.t) });
    await library.createMeeting({ title: 'Old file', date: '2019-05-05', source: 'imported' });
    library.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    expect(library.previewAutoDelete()).toEqual([]);
    await library.close();
  });

  it('waits while recording and never touches unfinished meetings', async () => {
    const clock = { t: start };
    const library = await Library.open({ root: await tempDir(), now: () => new Date(clock.t) });
    const { id } = await seeded(library);
    const recording = await library.createMeeting({ title: 'Live', status: 'recording' });
    library.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    clock.t += 400 * DAY;
    expect((await library.runAutoDelete()).deferred).toBe(true);
    expect(library.listMeetings()).toHaveLength(2);

    await library.updateMeeting(recording.id, { status: 'importing' });
    const run = await library.runAutoDelete();
    expect(run.results.map((result) => result.meetingId)).toEqual([id]);
    expect(library.listMeetings().map((row) => row.id)).toEqual([recording.id]);
    await library.close();
  });

  it('runs on start and on its timer, and stops', async () => {
    const clock = { t: start };
    const library = await Library.open({ root: await tempDir(), now: () => new Date(clock.t) });
    await seeded(library);
    library.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    clock.t += 31 * DAY;
    const stop = library.startAutoDeleteSchedule(5);
    await expect.poll(() => library.listMeetings().length).toBe(0);
    await seeded(library);
    clock.t += 31 * DAY;
    await expect.poll(() => library.listMeetings().length).toBe(0);
    stop();
    await library.close();
  });

  itPosix('a failed audio delete is reported and retried', async () => {
    const clock = { t: start };
    const library = await Library.open({ root: await tempDir(), now: () => new Date(clock.t) });
    const { id } = await seeded(library);
    const files = library.meetingPaths(id);
    await writeFile(path.join(files.audioMeeting, 'chunk.opus'), 'audio');
    await chmod(files.audio, 0o555);
    library.settings.setAutoDelete({ period: '30d', scope: 'audio' });
    clock.t += 31 * DAY;
    const run = await library.runAutoDelete();
    await chmod(files.audio, 0o755);
    expect(run.results[0]?.ok).toBe(false);
    expect((await library.getMeeting(id)).audioDeletedAt).toBeNull();
    expect((await library.runAutoDelete()).results[0]?.ok).toBe(true);
    await library.close();
  });
});

describe('search', () => {
  it('finds titles, dates and transcript text, with a playable time', async () => {
    const library = await Library.open({ root: await tempDir() });
    const a = await seeded(library, 'Budget review', 'nothing of note here', '2026-03-01');
    const b = await seeded(library, 'Standup', 'the budget slipped again today', '2026-04-02');
    await seeded(library, 'Lunch', 'sandwiches', '2026-05-03');

    const byText = await library.search('budget');
    expect(byText.results.map((r) => r.meeting.id)).toEqual([b.id, a.id]);
    expect(byText.results[0]).toMatchObject({ matchedIn: ['transcript'], hitCount: 1 });
    expect(byText.results[0]?.hits[0]).toMatchObject({ startMs: 500, speakerId: 'a' });
    expect(byText.results[1]?.matchedIn).toEqual(['title or date']);

    expect((await library.search('2026-05')).results.map((r) => r.meeting.title)).toEqual([
      'Lunch',
    ]);
    await library.close();
  });

  it('searches corrected text, ignores case and accents, and crosses segments', async () => {
    const library = await Library.open({ root: await tempDir() });
    const { id, ids } = await seeded(library, 'Sync', 'we met jon smith at the cafe');
    await library.applyCorrection(id, { wordIds: ids.slice(2, 4), replacement: 'Zoë Müller' });
    await library.appendSegments(id, [segment('s2', 'a', words('at noon', 100_000))]);

    expect((await library.search('ZOE muller')).results).toHaveLength(1);
    expect((await library.search('jon smith')).results).toHaveLength(0);
    expect((await library.search('cafe, at noon')).results[0]?.hits[0]?.snippet).toContain(
      'at noon',
    );
    await library.close();
  });

  it('treats wildcards as plain text, filters by date, skips damaged files', async () => {
    const library = await Library.open({ root: await tempDir() });
    await seeded(library, '100% done', 'hello', '2026-01-01');
    const b = await seeded(library, 'Plain', 'hello', '2026-06-01');
    expect((await library.search('%')).results.map((r) => r.meeting.title)).toEqual(['100% done']);
    expect((await library.search('hello', { fromDate: '2026-03-01' })).results).toHaveLength(1);

    await writeFile(library.meetingPaths(b.id).transcript, 'garbage');
    const outcome = await library.search('hello');
    expect(outcome.skippedMeetingIds).toEqual([b.id]);
    expect(outcome.results).toHaveLength(1);
    await library.close();
  });

  it('stops when cancelled, and leaves unfinished imports out', async () => {
    const library = await Library.open({ root: await tempDir() });
    await seeded(library, 'One', 'hello');
    const { id } = await library.createMeeting({
      title: 'hello',
      source: 'imported',
      status: 'importing',
    });
    expect((await library.search('hello')).results.map((r) => r.meeting.id)).not.toContain(id);
    const signal = AbortSignal.abort();
    expect((await library.search('hello', { signal })).results).toEqual([]);
    expect(foldText(' Café, déjà-vu ')).toBe('cafe dejavu');
    await library.close();
  });
});

describe('logs', () => {
  it('keeps events and drops anything that could be transcript text or a title', async () => {
    const dir = await tempDir();
    const logger = new Logger(dir, () => new Date('2026-10-30T12:00:00Z'));
    logger.log('info', 'word-saved', {
      meetingId: 'abc-123',
      count: 3,
      ok: true,
      text: 'secretword',
      title: 'Merger',
      note: 'free text with spaces',
      detail: '/Users/me/MeetingScribe/meetings/2026-10-28 Merger/transcript.json',
      blob: { nested: 'secret' },
      audio: Buffer.from('xx'),
    });
    logger.log('info', 'free text event with secret');
    await logger.flush();
    const body = await readFile(path.join(dir, 'scrb-2026-10-30.log'), 'utf8');
    for (const banned of ['secretword', 'Merger', 'free text', 'Users', 'nested', 'secret']) {
      expect(body).not.toContain(banned);
    }
    const first = JSON.parse(body.split('\n')[0] as string) as Record<string, unknown>;
    expect(first).toMatchObject({ event: 'word-saved', meetingId: 'abc-123', count: 3, ok: true });
  });

  it('library activity leaks nothing into the logs', async () => {
    const root = await tempDir();
    const library = await Library.open({ root });
    const { id, ids } = await seeded(
      library,
      'Confidential merger',
      'zebrafish quartermaster tangerine',
    );
    await library.applyCorrection(id, { wordIds: ids.slice(0, 1), replacement: 'kiwi' });
    await library.search('quartermaster');
    await library.deleteMeeting(id);
    await library.close();
    const [file] = await readdir(path.join(root, 'logs'));
    const body = await readFile(path.join(root, 'logs', file as string), 'utf8');
    expect(body).toContain('meeting-deleted');
    for (const banned of ['Confidential', 'quartermaster', 'kiwi', 'zebrafish']) {
      expect(body).not.toContain(banned);
    }
  });

  it('keeps 14 days, drops older files, and rolls over at midnight', async () => {
    const dir = await tempDir();
    let at = new Date('2026-10-30T12:00:00Z');
    const logger = new Logger(dir, () => at);
    await writeFile(path.join(dir, 'scrb-2026-10-15.log'), 'old');
    // Holds lines up to midnight on the 17th, so part of it is still inside the 14 days.
    await writeFile(path.join(dir, 'scrb-2026-10-16.log'), 'keep');
    await writeFile(path.join(dir, 'crash-report.txt'), 'not ours');
    logger.log('info', 'one');
    await logger.flush();
    expect((await readdir(dir)).sort()).toEqual([
      'crash-report.txt',
      'scrb-2026-10-16.log',
      'scrb-2026-10-30.log',
    ]);
    at = new Date('2026-11-01T00:00:01Z');
    logger.log('info', 'two');
    await logger.flush();
    expect(await readdir(dir)).toContain('scrb-2026-11-01.log');
    expect(await readdir(dir)).not.toContain('scrb-2026-10-16.log');
  });

  it('a logging failure never reaches the caller', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'not-a-folder');
    await writeFile(file, '');
    const logger = new Logger(file);
    logger.log('info', 'x');
    await expect(logger.flush()).resolves.toBeUndefined();
  });
});

describe('library location', () => {
  it('falls back to the default and remembers a choice', async () => {
    const config = await tempDir();
    expect(await readLibraryLocation(config, '/default')).toBe('/default');
    await writeLibraryLocation(config, '/chosen');
    expect(await readLibraryLocation(config, '/default')).toBe('/chosen');
    await writeFile(path.join(config, 'library-location.json'), 'garbage');
    expect(await readLibraryLocation(config, '/default')).toBe('/default');
  });
});
