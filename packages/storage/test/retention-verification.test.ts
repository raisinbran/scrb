import { existsSync } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { MeetingNotFoundError } from '../src/errors.ts';
import { Library } from '../src/library.ts';
import { segment, speaker, tempDir, words } from './helpers.ts';

const DAY = 86_400_000;
const START = Date.parse('2026-01-01T00:00:00.000Z');
const MODEL = 'invented-retention-model';

const policies = [
  ['never', 5000],
  ['30d', 30],
  ['90d', 90],
  ['180d', 180],
  ['1y', 365],
] as const;

async function meetingWithVoice(library: Library, title: string) {
  const { id } = await library.createMeeting({ title, status: 'ready' });
  const files = library.meetingPaths(id);
  await library.appendSegments(
    id,
    [segment('retention-segment', 'synthetic-speaker', words('invented', 0), 'final')],
    [speaker('synthetic-speaker', 'Invented speaker')],
  );
  await writeFile(path.join(files.audioMeeting, 'invented.wav'), 'invented audio bytes');
  await library.saveGeneratedSummary(id, {
    generatedAt: null,
    brief: {
      sections: [
        { id: 'invented-summary', heading: null, text: 'invented summary', edited: false },
      ],
    },
    full: null,
    actionItems: [],
    decisions: [],
    openQuestions: [],
    warnings: [],
  });
  await writeFile(path.join(files.exports, 'invented.txt'), 'invented export bytes');
  const cache = library.meetingCache(id);
  await mkdir(cache, { recursive: true });
  await writeFile(path.join(cache, 'invented-cache.bin'), 'invented cache bytes');
  await library.saveVoices(id, {
    modelId: MODEL,
    speakers: [
      { speakerId: 'synthetic-speaker', embedding: new Float32Array([1, 0]), segments: 8 },
    ],
  });
  return {
    id,
    files,
    cache,
    textFiles: [files.transcript, files.summary, path.join(files.exports, 'invented.txt')],
  };
}

function dbRows(root: string, meetingId: string) {
  const db = new DatabaseSync(path.join(root, 'index.sqlite'));
  try {
    return {
      meeting: db
        .prepare('SELECT id, audio_deleted_at FROM meetings WHERE id = ?')
        .get(meetingId) as { id: string; audio_deleted_at: string | null } | undefined,
      profileLinks: db
        .prepare(
          'SELECT profile_id, meeting_id, embedding FROM voice_profile_meetings WHERE meeting_id = ?',
        )
        .all(meetingId) as {
        profile_id: string;
        meeting_id: string;
        embedding: Uint8Array | null;
      }[],
      contributions: db
        .prepare(
          'SELECT profile_id, meeting_id FROM voice_profile_meetings WHERE meeting_id = ? AND embedding IS NOT NULL',
        )
        .all(meetingId) as { profile_id: string; meeting_id: string }[],
    };
  } finally {
    db.close();
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function expectFilesUnchanged(files: string[], contents: Buffer[]) {
  for (const [index, file] of files.entries()) {
    await expect(fileExists(file), `${file} exists`).resolves.toBe(true);
    await expect(readFile(file)).resolves.toEqual(contents[index]);
  }
}

describe('retention verification', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it.each(
    policies.flatMap(([period, age]) =>
      (['audio', 'meeting'] as const).map((scope) => [period, age, scope] as const),
    ),
  )(
    '%s / %s days / %s scope removes only expired audio or the whole meeting and its contribution',
    async (period, ageDays, scope) => {
      const clock = { now: START };
      const root = await tempDir();
      roots.push(root);
      const library = await Library.open({ root, now: () => new Date(clock.now) });
      const profile = library.voiceProfiles.create({
        name: 'Invented voice',
        modelId: MODEL,
        embedding: new Float32Array([1, 0]),
      });
      const old = await meetingWithVoice(library, 'Invented old meeting');
      library.voiceProfiles.setContribution({
        profileId: profile.id,
        meetingId: old.id,
        embedding: new Float32Array([1, 0]),
        sampleCount: 8,
        modelId: MODEL,
      });

      clock.now += ageDays * DAY;
      const fresh = await meetingWithVoice(library, 'Invented fresh meeting');
      library.voiceProfiles.setContribution({
        profileId: profile.id,
        meetingId: fresh.id,
        embedding: new Float32Array([0, 1]),
        sampleCount: 8,
        modelId: MODEL,
      });
      library.settings.setAutoDelete({ period, scope });
      const oldTextContents = await Promise.all(old.textFiles.map((file) => readFile(file)));
      const freshTextContents = await Promise.all(fresh.textFiles.map((file) => readFile(file)));

      const run = await library.runAutoDelete();
      const deleted = period === 'never' ? false : true;
      expect(run.results).toEqual(deleted ? [{ meetingId: old.id, ok: true, remaining: [] }] : []);

      const oldRows = dbRows(root, old.id);
      const freshRows = dbRows(root, fresh.id);
      expect(freshRows.meeting?.id).toBe(fresh.id);
      expect(freshRows.contributions).toHaveLength(1);
      expect(freshRows.profileLinks).toHaveLength(1);
      expect(await fileExists(fresh.files.audio)).toBe(true);
      expect(await fileExists(fresh.files.voices)).toBe(true);
      await expect(fileExists(fresh.cache)).resolves.toBe(true);
      await expectFilesUnchanged(fresh.textFiles, freshTextContents);

      if (!deleted) {
        expect(oldRows.meeting?.id).toBe(old.id);
        expect(oldRows.meeting?.audio_deleted_at).toBeNull();
        expect(oldRows.contributions).toHaveLength(1);
        expect(oldRows.profileLinks).toHaveLength(1);
        expect(await fileExists(old.files.audio)).toBe(true);
        expect(await fileExists(old.files.voices)).toBe(true);
        expect(await fileExists(old.files.folder)).toBe(true);
        expect(await fileExists(old.cache)).toBe(true);
        await expectFilesUnchanged(old.textFiles, oldTextContents);
      } else if (scope === 'audio') {
        expect(oldRows.meeting?.id).toBe(old.id);
        expect(oldRows.meeting?.audio_deleted_at).not.toBeNull();
        expect(oldRows.contributions).toEqual([]);
        expect(oldRows.profileLinks).toMatchObject([{ embedding: null }]);
        expect(await fileExists(old.files.folder)).toBe(true);
        expect(await fileExists(old.files.audio)).toBe(false);
        expect(await fileExists(old.files.voices)).toBe(false);
        expect(await fileExists(old.cache)).toBe(false);
        await expectFilesUnchanged(old.textFiles, oldTextContents);
      } else {
        expect(oldRows.meeting).toBeUndefined();
        expect(oldRows.contributions).toEqual([]);
        expect(await fileExists(old.files.folder)).toBe(false);
        expect(await fileExists(old.cache)).toBe(false);
      }
      await library.close();
    },
  );

  it.each(policies.slice(1))(
    '%s is ineligible one millisecond before and eligible at its boundary',
    async (period, days) => {
      const clock = { now: START };
      const root = await tempDir();
      roots.push(root);
      const library = await Library.open({ root, now: () => new Date(clock.now) });
      const { id } = await meetingWithVoice(library, 'Invented boundary meeting');
      library.settings.setAutoDelete({ period, scope: 'meeting' });

      clock.now = START + days * DAY - 1;
      expect(await library.runAutoDelete()).toMatchObject({ results: [] });
      expect(library.listMeetings().map((row) => row.id)).toEqual([id]);
      clock.now += 1;
      expect((await library.runAutoDelete()).results).toMatchObject([
        { meetingId: id, ok: true, remaining: [] },
      ]);
      expect(library.listMeetings()).toEqual([]);
      await library.close();
    },
  );

  it('manual audio delete records the timestamp and purges voice files and contribution rows', async () => {
    const root = await tempDir();
    roots.push(root);
    const library = await Library.open({ root });
    const profile = library.voiceProfiles.create({
      name: 'Invented voice',
      modelId: MODEL,
      embedding: new Float32Array([1, 0]),
    });
    const meeting = await meetingWithVoice(library, 'Invented audio delete');
    library.voiceProfiles.setContribution({
      profileId: profile.id,
      meetingId: meeting.id,
      embedding: new Float32Array([1, 0]),
      sampleCount: 8,
      modelId: MODEL,
    });

    expect(await library.deleteAudio(meeting.id)).toMatchObject({ ok: true, remaining: [] });
    expect(await fileExists(meeting.files.folder)).toBe(true);
    expect(await fileExists(meeting.files.audio)).toBe(false);
    expect(await fileExists(meeting.files.voices)).toBe(false);
    expect(await fileExists(meeting.files.transcript)).toBe(true);
    expect(dbRows(root, meeting.id)).toMatchObject({
      meeting: { id: meeting.id, audio_deleted_at: expect.any(String) },
      contributions: [],
      profileLinks: [{ embedding: null }],
    });
    await library.close();
  });

  it('manual meeting delete is permanent and transcript undo cannot restore it', async () => {
    const root = await tempDir();
    roots.push(root);
    let library = await Library.open({ root });
    const profile = library.voiceProfiles.create({
      name: 'Invented voice',
      modelId: MODEL,
      embedding: new Float32Array([1, 0]),
    });
    const meeting = await meetingWithVoice(library, 'Invented meeting delete');
    library.voiceProfiles.setContribution({
      profileId: profile.id,
      meetingId: meeting.id,
      embedding: new Float32Array([1, 0]),
      sampleCount: 8,
      modelId: MODEL,
    });

    expect(await library.deleteMeeting(meeting.id)).toMatchObject({ ok: true, remaining: [] });
    expect(dbRows(root, meeting.id)).toEqual({
      meeting: undefined,
      contributions: [],
      profileLinks: [],
    });
    expect(await fileExists(meeting.files.folder)).toBe(false);
    await expect(library.undo(meeting.id)).rejects.toBeInstanceOf(MeetingNotFoundError);
    await library.close();

    library = await Library.open({ root });
    expect(library.listMeetings()).toEqual([]);
    expect(library.openReport.finishedDeletes).toEqual([]);
    await library.close();
  });

  it('startup completes a delete interrupted after the folder was renamed to trash', async () => {
    const root = await tempDir();
    roots.push(root);
    let library = await Library.open({ root });
    const profile = library.voiceProfiles.create({
      name: 'Invented voice',
      modelId: MODEL,
      embedding: new Float32Array([1, 0]),
    });
    const meeting = await meetingWithVoice(library, 'Invented interrupted delete');
    library.voiceProfiles.setContribution({
      profileId: profile.id,
      meetingId: meeting.id,
      embedding: new Float32Array([1, 0]),
      sampleCount: 8,
      modelId: MODEL,
    });
    await library.close();
    await rename(meeting.files.folder, path.join(root, 'meetings', `.deleting-${meeting.id}`));

    library = await Library.open({ root });
    expect(library.openReport.finishedDeletes).toEqual([meeting.id]);
    expect(library.listMeetings()).toEqual([]);
    expect(dbRows(root, meeting.id)).toEqual({
      meeting: undefined,
      contributions: [],
      profileLinks: [],
    });
    expect(existsSync(path.join(root, 'meetings', `.deleting-${meeting.id}`))).toBe(false);
    await library.close();
  });
});
