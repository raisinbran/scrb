import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { MIGRATIONS, migrate } from '../src/db/migrations.ts';
import type { TranscriptFile } from '../src/formats/transcript.ts';
import { Library } from '../src/library.ts';
import { decodeVoices, encodeVoices, readVoicesFile } from '../src/voices-file.ts';
import { segment, speaker, tempDir, words } from './helpers.ts';

const MODEL = 'invented-model';
const vec = (...values: number[]): Float32Array => Float32Array.from(values);
const DAY = 86_400_000;

/** A ready meeting with speakers a and b, both hand-named and linked to the given profiles. */
async function meetingWith(
  library: Library,
  links: { a?: string; b?: string },
  voices: Record<string, [number[], number]> = {
    a: [[1, 0, 0], 10],
    b: [[0, 1, 0], 12],
  },
  title = 'Invented sync',
): Promise<{ id: string; wordIds: string[] }> {
  const { id } = await library.createMeeting({ title, date: '2026-10-28', status: 'ready' });
  const aWords = words('alpha bravo charlie delta echo foxtrot', 0);
  const bWords = words('golf hotel india juliet', 10_000);
  await library.appendSegments(
    id,
    [segment('s1', 'a', aWords, 'final'), segment('s2', 'b', bWords, 'final')],
    [speaker('a'), speaker('b')],
  );
  await setSpeakers(library, id, (s) => ({
    ...s,
    userNamed: true,
    name: `Invented ${s.id}`,
    profileId: links[s.id as 'a' | 'b'] ?? null,
  }));
  await library.saveVoices(id, {
    modelId: MODEL,
    speakers: Object.entries(voices).map(([speakerId, [embedding, segments]]) => ({
      speakerId,
      embedding: Float32Array.from(embedding),
      segments,
    })),
  });
  return { id, wordIds: aWords.map((w) => w.id) };
}

async function setSpeakers(
  library: Library,
  id: string,
  change: (s: TranscriptFile['speakers'][number]) => TranscriptFile['speakers'][number],
): Promise<void> {
  const current = await library.readTranscript(id);
  await library.saveTranscript(
    id,
    { ...current, speakers: current.speakers.map(change) },
    current.revision,
  );
}

async function open(now?: () => Date): Promise<{ library: Library; root: string }> {
  const root = await tempDir();
  return { library: await Library.open({ root, ...(now ? { now } : {}) }), root };
}

function profile(library: Library, name: string, embedding = vec(1, 0, 0), sampleCount = 1) {
  return library.voiceProfiles.create({ name, modelId: MODEL, embedding, sampleCount });
}

describe('migration 6 to 7', () => {
  it('keeps existing links as plain links with no voice', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, MIGRATIONS, 6);
    db.exec(
      `INSERT INTO voice_profiles VALUES ('p', 'N', 'm', x'00000000', 3, 't', 't');
       INSERT INTO voice_profile_meetings VALUES ('p', 'm1');`,
    );
    migrate(db);
    const row = db.prepare('SELECT * FROM voice_profile_meetings').get() as Record<string, unknown>;
    expect(row).toMatchObject({ embedding: null, sample_count: null, model_id: null });
    expect(db.prepare('SELECT kept FROM voice_profiles').get()).toEqual({ kept: 0 });
    db.close();
  });
});

describe('voices.json', () => {
  it('round-trips, is private, and rejects damaged files', async () => {
    const { library } = await open();
    const { id } = await meetingWith(library, {});
    const file = library.meetingPaths(id).voices;
    const voices = await library.readVoices(id);
    expect(voices?.speakers.map((s) => [s.speakerId, s.segments, Array.from(s.embedding)])).toEqual(
      [
        ['a', 10, [1, 0, 0]],
        ['b', 12, [0, 1, 0]],
      ],
    );
    if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readVoicesFile(path.join(path.dirname(file), 'none.json'))).toBeNull();
    for (const bad of [
      'not json',
      '{}',
      encodeVoices({ modelId: 'm', speakers: [] }).replace('1', '2'),
    ]) {
      expect(() => decodeVoices(bad)).toThrow(/voices.json/);
    }
    await library.close();
  });
});

describe('contribution store', () => {
  it('derives a profile from the segment-weighted mean of its contributions', async () => {
    const { library } = await open();
    const store = library.voiceProfiles;
    const p = profile(library, 'Invented A');
    store.setContribution({
      profileId: p.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 10,
      modelId: MODEL,
    });
    store.setContribution({
      profileId: p.id,
      meetingId: 'm2',
      embedding: vec(0, 1, 0),
      sampleCount: 30,
      modelId: MODEL,
    });
    expect(store.get(p.id)?.sampleCount).toBe(40);
    expect(Array.from(store.get(p.id)?.embedding ?? [])).toEqual([0.25, 0.75, 0]);
    // One row per (profile, meeting): setting again replaces.
    store.setContribution({
      profileId: p.id,
      meetingId: 'm2',
      embedding: vec(1, 0, 0),
      sampleCount: 10,
      modelId: MODEL,
    });
    expect(store.contributions(p.id)).toHaveLength(2);
    expect(store.get(p.id)?.sampleCount).toBe(20);
    expect(Array.from(store.get(p.id)?.embedding ?? [])).toEqual([1, 0, 0]);
    expect(() =>
      store.setContribution({
        profileId: p.id,
        meetingId: 'm3',
        embedding: vec(1, 0, 0),
        sampleCount: 1,
        modelId: 'other',
      }),
    ).toThrow();
    await library.close();
  });

  it('recomputes on removal and deletes a profile that loses its last contribution', async () => {
    const { library } = await open();
    const store = library.voiceProfiles;
    const p = profile(library, 'Invented A');
    store.setContribution({
      profileId: p.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 10,
      modelId: MODEL,
    });
    store.setContribution({
      profileId: p.id,
      meetingId: 'm2',
      embedding: vec(0, 1, 0),
      sampleCount: 30,
      modelId: MODEL,
    });
    expect(store.removeContribution(p.id, 'm2')).toBe(false);
    expect(store.get(p.id)).toMatchObject({ sampleCount: 10, meetingIds: ['m1'] });
    expect(store.removeContribution(p.id, 'm1')).toBe(true);
    expect(store.get(p.id)).toBeNull();
    await library.close();
  });

  it('keeps a hand-renamed profile, and one that still has a plain link', async () => {
    const { library } = await open();
    const store = library.voiceProfiles;
    const kept = profile(library, 'Invented kept');
    store.rename(kept.id, 'Invented renamed');
    store.setContribution({
      profileId: kept.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 5,
      modelId: MODEL,
    });
    expect(store.removeContribution(kept.id, 'm1')).toBe(false);
    expect(store.get(kept.id)).not.toBeNull();

    const linked = library.voiceProfiles.create({
      name: 'Invented linked',
      modelId: MODEL,
      embedding: vec(1, 0, 0),
      meetingId: 'old-meeting',
    });
    store.setContribution({
      profileId: linked.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 5,
      modelId: MODEL,
    });
    expect(store.removeContribution(linked.id, 'm1')).toBe(false);
    expect(store.get(linked.id)?.meetingIds).toEqual(['old-meeting']);
    await library.close();
  });

  it('merge moves rows, combines a shared meeting, and undo and redo restore them exactly', async () => {
    const { library } = await open();
    const store = library.voiceProfiles;
    const a = profile(library, 'Invented A');
    const b = profile(library, 'Invented B');
    store.setContribution({
      profileId: a.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 10,
      modelId: MODEL,
    });
    store.setContribution({
      profileId: a.id,
      meetingId: 'm2',
      embedding: vec(1, 0, 0),
      sampleCount: 10,
      modelId: MODEL,
    });
    store.setContribution({
      profileId: b.id,
      meetingId: 'm2',
      embedding: vec(0, 1, 0),
      sampleCount: 20,
      modelId: MODEL,
    });
    store.setContribution({
      profileId: b.id,
      meetingId: 'm3',
      embedding: vec(0, 1, 0),
      sampleCount: 20,
      modelId: MODEL,
    });

    store.merge(a.id, b.id);
    expect(store.get(a.id)).toBeNull();
    const rows = store.contributions(b.id);
    expect(rows.map((r) => [r.meetingId, r.sampleCount])).toEqual([
      ['m1', 10],
      ['m2', 30],
      ['m3', 20],
    ]);
    expect(store.get(b.id)?.sampleCount).toBe(60);
    const merged = Array.from(store.get(b.id)?.embedding ?? []);

    store.undo();
    expect(store.contributions(a.id).map((r) => r.meetingId)).toEqual(['m1', 'm2']);
    expect(store.contributions(b.id).map((r) => [r.meetingId, r.sampleCount])).toEqual([
      ['m2', 20],
      ['m3', 20],
    ]);
    store.redo();
    expect(Array.from(store.get(b.id)?.embedding ?? [])).toEqual(merged);
    expect(store.contributions(b.id)).toHaveLength(3);
    await library.close();
  });

  it('deleting a profile drops its contributions', async () => {
    const { library } = await open();
    const p = profile(library, 'Invented A');
    library.voiceProfiles.setContribution({
      profileId: p.id,
      meetingId: 'm1',
      embedding: vec(1, 0, 0),
      sampleCount: 5,
      modelId: MODEL,
    });
    library.voiceProfiles.delete(p.id);
    expect(library.voiceProfiles.meetingContributions('m1')).toEqual([]);
    await library.close();
  });
});

describe('reconcileContributions', () => {
  it('adds a row for each hand-named speaker with a voice, and is stable on repeat', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    await library.reconcileContributions(id);
    const row = library.voiceProfiles.contribution(pa.id, id);
    expect(row).toMatchObject({ sampleCount: 10, modelId: MODEL });
    expect(library.voiceProfiles.get(pa.id)).toMatchObject({ sampleCount: 10, meetingIds: [id] });
    const updated = library.voiceProfiles.get(pa.id)?.updatedAt;
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.get(pa.id)?.updatedAt).toBe(updated);
    await library.close();
  });

  it('never adds a row for an auto link, a speaker without a voice, or a plain link', async () => {
    const { library } = await open();
    const auto = profile(library, 'Invented auto');
    const noVoice = profile(library, 'Invented no voice');
    const { id } = await meetingWith(
      library,
      { a: auto.id, b: noVoice.id },
      { a: [[1, 0, 0], 10] },
    );
    await setSpeakers(library, id, (s) => (s.id === 'a' ? { ...s, userNamed: false } : s));
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.meetingContributions(id)).toEqual([]);
    await library.close();
  });

  it('removes the row when a speaker loses userNamed, without touching its profileId', async () => {
    const { library } = await open();
    const keep = profile(library, 'Invented keep');
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id, b: keep.id });
    await library.reconcileContributions(id);
    library.voiceProfiles.rename(pa.id, 'Invented a');
    await setSpeakers(library, id, (s) => (s.id === 'a' ? { ...s, userNamed: false } : s));
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contribution(pa.id, id)).toBeNull();
    expect((await library.readTranscript(id)).speakers.find((s) => s.id === 'a')?.profileId).toBe(
      pa.id,
    );
    await library.close();
  });

  it('deletes a profile made only by a rename once the rename goes away', async () => {
    const { library } = await open();
    const created = profile(library, 'Invented made');
    const { id } = await meetingWith(library, { a: created.id });
    await library.reconcileContributions(id);
    await setSpeakers(library, id, (s) =>
      s.id === 'a' ? { ...s, userNamed: false, profileId: null } : s,
    );
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.get(created.id)).toBeNull();
    await library.close();
  });

  it('merge through the library drops the merged-away speaker and recomputes', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const pb = profile(library, 'Invented b', vec(0, 1, 0));
    const { id } = await meetingWith(library, { a: pa.id, b: pb.id });
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.meetingContributions(id)).toHaveLength(2);

    await library.mergeSpeakers(id, 'a', 'b');
    expect(library.voiceProfiles.contribution(pa.id, id)).toBeNull();
    expect(library.voiceProfiles.get(pa.id)).toBeNull();
    // The survivor keeps its own contribution; a merge never adds a combined one.
    expect(library.voiceProfiles.contribution(pb.id, id)).toMatchObject({ sampleCount: 12 });

    // Undo restores the speaker, but its profile is gone: nothing is added back for a profile
    // that does not exist.
    await library.undo(id);
    expect(library.voiceProfiles.get(pa.id)).toBeNull();
    expect(library.voiceProfiles.meetingContributions(id)).toHaveLength(1);
    await library.close();
  });

  it('split removes the source speaker contribution, and the new speaker never adds one', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const other = profile(library, 'Invented other');
    const { id, wordIds } = await meetingWith(library, { a: pa.id });
    // A second meeting keeps the profile alive after the split.
    const second = await meetingWith(library, { a: pa.id }, undefined, 'Invented second');
    await library.reconcileContributions(id);
    await library.reconcileContributions(second.id);
    expect(library.voiceProfiles.get(pa.id)?.sampleCount).toBe(20);

    const t = await library.readTranscript(id);
    await library.splitSpeaker(id, wordIds.slice(0, 2), 'Invented new', t.revision);
    expect(library.voiceProfiles.contribution(pa.id, id)).toBeNull();
    expect(library.voiceProfiles.get(pa.id)).toMatchObject({ sampleCount: 10 });
    expect(library.voiceProfiles.get(other.id)).not.toBeNull();
    await library.close();
  });

  it('repairs a hand-named speaker whose store write was lost, on the next edit', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    expect(library.voiceProfiles.contribution(pa.id, id)).toBeNull();
    await library.renameSpeaker(id, 'b', 'Invented renamed b');
    expect(library.voiceProfiles.contribution(pa.id, id)).toMatchObject({ sampleCount: 10 });
    await library.close();
  });

  it('combines two speakers on one profile into one contribution', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id, b: pa.id });
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contributions(pa.id)).toHaveLength(1);
    expect(library.voiceProfiles.get(pa.id)?.sampleCount).toBe(22);
    await library.close();
  });

  it('replaces the row when a re-run pass writes new voices', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    await library.reconcileContributions(id);
    await library.saveVoices(id, {
      modelId: MODEL,
      speakers: [{ speakerId: 'a', embedding: vec(0, 0, 1), segments: 9 }],
    });
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contribution(pa.id, id)).toMatchObject({ sampleCount: 9 });
    expect(Array.from(library.voiceProfiles.get(pa.id)?.embedding ?? [])).toEqual([0, 0, 1]);
    await library.close();
  });

  it('changes nothing when voices.json is damaged, and leaves plain links alone', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    await library.reconcileContributions(id);
    await writeFile(library.meetingPaths(id).voices, 'garbage');
    await setSpeakers(library, id, (s) => ({ ...s, userNamed: false }));
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contribution(pa.id, id)).not.toBeNull();

    const linked = library.voiceProfiles.create({
      name: 'Invented link',
      modelId: MODEL,
      embedding: vec(1, 0, 0),
      meetingId: id,
    });
    await rm(library.meetingPaths(id).voices);
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.get(linked.id)?.meetingIds).toEqual([id]);
    await library.close();
  });

  it('does not delete rows while a speaker points at a profile that was merged away', async () => {
    const { library } = await open();
    const from = profile(library, 'Invented from');
    const into = profile(library, 'Invented into');
    const { id } = await meetingWith(library, { a: from.id });
    await library.reconcileContributions(id);
    library.voiceProfiles.merge(from.id, into.id);
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contribution(into.id, id)).not.toBeNull();
    await library.close();
  });
});

describe('lock order', () => {
  it('edits, matching-style assignment, profile delete and meeting delete together never deadlock', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const pb = profile(library, 'Invented b', vec(0, 1, 0));
    const first = await meetingWith(library, { a: pa.id, b: pb.id });
    const second = await meetingWith(library, { a: pa.id }, undefined, 'Invented second');
    await library.reconcileContributions(first.id);
    await library.reconcileContributions(second.id);
    const t = await library.readTranscript(first.id);

    const all = Promise.all([
      library.renameSpeaker(first.id, 'a', 'Invented again'),
      library.mergeSpeakers(first.id, 'b', 'a').catch(() => undefined),
      library.reconcileContributions(second.id),
      library.deleteVoiceProfile(pb.id),
      library.undo(first.id).catch(() => undefined),
      library
        .assignSpeakerProfiles(first.id, [], t.revision, new AbortController().signal)
        .catch(() => undefined),
    ]);
    const timeout = new Promise((resolve) => setTimeout(() => resolve('stuck'), 10_000));
    expect(await Promise.race([all.then(() => 'done'), timeout])).toBe('done');
    await library.close();
  });

  it('deleteProfile clears profileId in each transcript, keeps voices.json, drops contributions', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    await library.reconcileContributions(id);
    await library.deleteVoiceProfile(pa.id);
    expect(
      (await library.readTranscript(id)).speakers.find((s) => s.id === 'a')?.profileId,
    ).toBeNull();
    expect(library.voiceProfiles.get(pa.id)).toBeNull();
    expect(library.voiceProfiles.meetingContributions(id)).toEqual([]);
    expect(await library.readVoices(id)).not.toBeNull();
    await library.close();
  });
});

describe('purge paths', () => {
  async function twoMeetings() {
    const clock = { t: Date.parse('2026-10-28T00:00:00Z') };
    const { library, root } = await open(() => new Date(clock.t));
    const pa = profile(library, 'Invented a');
    const first = await meetingWith(library, { a: pa.id }, { a: [[1, 0, 0], 10] });
    const second = await meetingWith(
      library,
      { a: pa.id },
      { a: [[0, 1, 0], 30] },
      'Invented second',
    );
    await library.reconcileContributions(first.id);
    await library.reconcileContributions(second.id);
    expect(library.voiceProfiles.get(pa.id)?.sampleCount).toBe(40);
    return { library, root, pa, first: first.id, second: second.id, clock };
  }

  it('manual delete-audio removes voices.json and that meeting contribution, recomputing', async () => {
    const { library, pa, first, second } = await twoMeetings();
    expect((await library.deleteAudio(first)).ok).toBe(true);
    expect(await library.readVoices(first)).toBeNull();
    expect(library.voiceProfiles.contribution(pa.id, first)).toBeNull();
    // The link stays as a plain link; the profile now stands on the other meeting only.
    expect(library.voiceProfiles.get(pa.id)).toMatchObject({ sampleCount: 30 });
    expect(library.voiceProfiles.get(pa.id)?.meetingIds.sort()).toEqual([first, second].sort());
    expect(await library.readVoices(second)).not.toBeNull();
    await library.close();
  });

  it('delete-audio fails and keeps the audio while voices.json cannot be removed', async () => {
    const { library, pa, first } = await twoMeetings();
    const voices = library.meetingPaths(first).voices;
    await mkdir(path.join(path.dirname(voices), 'audio'), { recursive: true });
    await writeFile(path.join(path.dirname(voices), 'audio', 'a.bin'), 'x');
    // A non-empty folder in its place makes the plain file removal fail.
    await rm(voices);
    await mkdir(voices);
    await writeFile(path.join(voices, 'stuck'), 'x');
    const report = await library.deleteAudio(first);
    expect(report.ok).toBe(false);
    expect(report.remaining).toContain(voices);
    expect((await stat(path.join(path.dirname(voices), 'audio', 'a.bin'))).isFile()).toBe(true);
    expect((await library.getMeeting(first)).audioDeletedAt).toBeNull();
    expect(library.voiceProfiles.contribution(pa.id, first)).toBeNull();
    await library.close();
  });

  it('delete-audio fails and keeps the audio while contributions cannot be dropped', async () => {
    const { library, first } = await twoMeetings();
    const files = library.meetingPaths(first);
    await mkdir(files.audio, { recursive: true });
    await writeFile(path.join(files.audio, 'a.bin'), 'x');
    const spy = vi
      .spyOn(library.voiceProfiles, 'dropMeetingContributions')
      .mockImplementationOnce(() => {
        throw new Error('busy');
      });
    const report = await library.deleteAudio(first);
    expect(report.ok).toBe(false);
    expect((await stat(path.join(files.audio, 'a.bin'))).isFile()).toBe(true);
    expect((await library.getMeeting(first)).audioDeletedAt).toBeNull();
    spy.mockRestore();
    // A retry completes the delete.
    expect((await library.deleteAudio(first)).ok).toBe(true);
    expect(library.voiceProfiles.meetingContributions(first)).toEqual([]);
    await library.close();
  });

  it('profile undo after a purge does not bring the deleted voice back', async () => {
    const { library, pa, first } = await twoMeetings();
    const other = profile(library, 'Invented other', vec(0, 1, 0));
    library.voiceProfiles.merge(other.id, pa.id);
    await library.deleteAudio(first);
    expect(library.voiceProfiles.undoState().canUndo).toBe(false);
    expect(() => library.voiceProfiles.undo()).not.toThrow();
    expect(library.voiceProfiles.contribution(pa.id, first)).toBeNull();
    await library.close();
  });

  it('audio-only auto-delete does the same', async () => {
    const { library, pa, first, clock } = await twoMeetings();
    library.settings.setAutoDelete({ period: '30d', scope: 'audio' });
    clock.t += 31 * DAY;
    const run = await library.runAutoDelete();
    expect(run.results.every((r) => r.ok)).toBe(true);
    expect(await library.readVoices(first)).toBeNull();
    expect(library.voiceProfiles.meetingContributions(first)).toEqual([]);
    expect(library.voiceProfiles.get(pa.id)).not.toBeNull();
    await library.close();
  });

  it('meeting delete recomputes a surviving profile, with or without removing learned data', async () => {
    const { library, pa, first, second } = await twoMeetings();
    await library.deleteMeeting(first);
    expect(library.voiceProfiles.get(pa.id)).toMatchObject({
      sampleCount: 30,
      meetingIds: [second],
    });
    await library.deleteMeeting(second, false, true);
    expect(library.voiceProfiles.get(pa.id)).toBeNull();
    await library.close();
  });

  it('meeting delete with learned data removes a sole profile and its rows', async () => {
    const { library } = await open();
    const pa = profile(library, 'Invented a');
    const { id } = await meetingWith(library, { a: pa.id });
    await library.reconcileContributions(id);
    const report = await library.deleteMeeting(id, false, true);
    expect(report.ok).toBe(true);
    expect(library.voiceProfiles.get(pa.id)).toBeNull();
    await library.close();
  });

  it('the next open recomputes a profile whose meeting folder vanished', async () => {
    const { library, root, pa, first, second } = await twoMeetings();
    const folder = library.meetingPaths(first).folder;
    await library.close();
    await rm(folder, { recursive: true });
    const reopened = await Library.open({ root });
    expect(reopened.voiceProfiles.get(pa.id)).toMatchObject({
      sampleCount: 30,
      meetingIds: [second],
    });
    await reopened.close();
    expect(await readFile(path.join(root, 'index.sqlite'))).toBeTruthy();
  });
});
