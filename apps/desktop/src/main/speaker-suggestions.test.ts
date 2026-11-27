// @vitest-environment node
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '@scrb/storage';
import {
  APPROVED_EMBEDDING_SHA256,
  APPROVED_PROFILE_MODEL,
  startProfileMatching,
  toModelReplacement,
} from '@scrb/app-core';
import type { FinalTranscript } from '@scrb/transcription';
import { createMeetingHandlers } from './meetings.ts';
import { dispatchCall } from './dispatch.ts';

// Invented unit vectors with a set cosine to [1, 0]; no recordings.
const at = (score: number) => [score, Math.sqrt(1 - score * score)];
const transcript = (vectors: number[][], segments = 8): FinalTranscript => ({
  version: 1,
  durationMs: 2000,
  words: vectors.map((_, i) => ({
    text: 'invented',
    startMs: i * 1000,
    endMs: i * 1000 + 500,
    confidence: 1,
    track: 'meeting',
    speakerId: `s${i}`,
  })),
  turns: vectors.map((_, i) => ({
    speakerId: `s${i}`,
    startMs: i * 1000,
    endMs: i * 1000 + 500,
    text: 'invented',
    firstWord: i,
    wordCount: 1,
  })),
  speakers: vectors.map((embedding, i) => ({
    id: `s${i}`,
    label: `Speaker ${i + 1}`,
    speechMs: 500,
    embedding,
    embeddingSegments: segments,
  })),
  spans: [],
  models: { speech: 'invented', segmentation: 'invented', embedding: 'invented' },
  timing: { transcribeMs: 1, diarizeMs: 1 },
});

describe('speaker suggestions (backend)', () => {
  let library: Library;
  let opened: Library | undefined;
  let root: string;
  let events: { name: string; payload: unknown }[];
  beforeEach(async () => {
    opened = undefined;
    events = [];
    root = await mkdtemp(join(tmpdir(), 'scrb-p4s-'));
    library = await Library.open({ root: join(root, 'library') });
    opened = library;
  });
  afterEach(async () => {
    await opened?.close();
  });
  const handlers = () =>
    createMeetingHandlers(library, (name, payload) => {
      events.push({ name, payload });
    });
  const profile = (overrides = {}) =>
    library.voiceProfiles.create({
      name: 'Invented name',
      embedding: new Float32Array([1, 0]),
      sampleCount: 8,
      modelId: APPROVED_PROFILE_MODEL,
      ...overrides,
    });
  /** A ready meeting from a result; with `voices`, also its voices.json so renames can learn. */
  const seed = async (result: FinalTranscript, voices = true) => {
    const { id } = await library.createMeeting({ title: 'Invented', status: 'ready' });
    await library.applyFinalPass(id, toModelReplacement(result));
    if (voices) {
      await library.saveVoices(id, {
        modelId: APPROVED_PROFILE_MODEL,
        speakers: result.speakers.map((s) => ({
          speakerId: s.id,
          embedding: Float32Array.from(s.embedding ?? []),
          segments: s.embeddingSegments,
        })),
      });
    }
    return id;
  };
  const match = async (id: string, result: FinalTranscript) => {
    const job = startProfileMatching(
      library,
      async () => APPROVED_EMBEDDING_SHA256,
      (suggestion) => events.push({ name: 'speakerSuggestion', payload: suggestion }),
    );
    await job(id, result, 'invented-model', new AbortController().signal);
  };
  const list = async (meetingId?: string) => {
    const envelope = await dispatchCall(handlers(), 'listSpeakerSuggestions', {
      ...(meetingId ? { meetingId } : {}),
    });
    if (!envelope.ok) throw new Error('list failed');
    return envelope.value as { meetingId: string; speakerId: string; profileId: string }[];
  };
  const answer = (meetingId: string, speakerId: string, profileId: string, accepted: boolean) =>
    dispatchCall(handlers(), 'answerSpeakerSuggestion', {
      meetingId,
      speakerId,
      profileId,
      accepted,
    });

  it.each([0.449999999999, 0.45, 0.599999999999, 0.6])(
    'offers a suggestion only from 0.45 up to the auto line (score %s)',
    async (score) => {
      const p = profile();
      const result = transcript([at(score)]);
      const id = await seed(result);
      await match(id, result);
      const found = await list(id);
      const expected = score >= 0.45 && score < 0.6;
      expect(found.map((s) => [s.speakerId, s.profileId])).toEqual(expected ? [['s0', p.id]] : []);
      expect(events).toHaveLength(expected ? 1 : 0);
    },
  );

  it('never suggests for an automatic match, and a thin profile only suggests', async () => {
    const strong = profile();
    const thin = profile({
      name: 'Invented thin',
      embedding: new Float32Array([0, 1]),
      sampleCount: 3,
    });
    const result = transcript([at(0.8), [0, 1]]);
    const id = await seed(result);
    await match(id, result);
    const saved = await library.readTranscript(id);
    expect(saved.speakers[0]?.profileId).toBe(strong.id);
    expect(saved.speakers[1]?.profileId).toBeNull();
    expect((await list(id)).map((s) => [s.speakerId, s.profileId])).toEqual([['s1', thin.id]]);
  });

  it('lists for one meeting and across meetings, and survives a restart', async () => {
    const p = profile();
    const a = transcript([at(0.5)]);
    const b = transcript([at(0.55)]);
    const first = await seed(a);
    const second = await seed(b);
    await match(first, a);
    await match(second, b);
    expect((await list(first)).map((s) => s.meetingId)).toEqual([first]);
    expect((await list()).map((s) => s.meetingId).sort()).toEqual([first, second].sort());
    await library.close();
    library = await Library.open({ root: join(root, 'library') });
    opened = library;
    expect((await list()).map((s) => s.profileId)).toEqual([p.id, p.id]);
  });

  it('accept names the speaker, grows the suggested profile, and removes the suggestion', async () => {
    const p = profile({ name: 'Invented thin', sampleCount: 5 });
    const result = transcript([at(0.5)], 8);
    const id = await seed(result);
    await match(id, result);
    expect(await answer(id, 's0', p.id, true)).toMatchObject({ ok: true });
    const saved = await library.readTranscript(id);
    expect(saved.speakers[0]).toMatchObject({
      name: 'Invented thin',
      profileId: p.id,
      userNamed: true,
    });
    // The profile now stands on this meeting's contribution (8 segments), bypassing the 0.55 gate.
    expect(library.voiceProfiles.contribution(p.id, id)?.sampleCount).toBe(8);
    expect(library.voiceProfiles.get(p.id)?.meetingIds).toEqual([id]);
    expect(await list(id)).toEqual([]);
    expect(await answer(id, 's0', p.id, true)).toMatchObject({ ok: false });
  });

  it('decline persists across a restart and stays declined when matching re-runs on the same pass', async () => {
    const p = profile();
    const result = transcript([at(0.5)]);
    const id = await seed(result);
    await match(id, result);
    expect(await answer(id, 's0', p.id, false)).toMatchObject({ ok: true });
    // A second decline (a double click) is a no-op, not an error.
    expect(await answer(id, 's0', p.id, false)).toMatchObject({ ok: true });
    expect(await list(id)).toEqual([]);
    await library.close();
    library = await Library.open({ root: join(root, 'library') });
    opened = library;
    expect(await list(id)).toEqual([]);
    await match(id, result);
    expect(await list(id)).toEqual([]);
    expect(events).toHaveLength(1);
    expect((await library.readTranscript(id)).speakers[0]?.profileId).toBeNull();
  });

  it('accepting after the profile was deleted or merged away is refused and creates no profile', async () => {
    const result = transcript([at(0.5)]);
    for (const how of ['delete', 'merge'] as const) {
      const p = profile({ name: `Invented ${how}` });
      const keep = profile({ name: `Invented keep ${how}`, embedding: new Float32Array([0, 1]) });
      const id = await seed(result);
      await match(id, result);
      const names = () =>
        library.voiceProfiles
          .list()
          .map((x) => x.name)
          .sort();
      if (how === 'delete') library.voiceProfiles.delete(p.id);
      else library.voiceProfiles.merge(p.id, keep.id);
      const before = names();
      expect(await answer(id, 's0', p.id, true)).toMatchObject({ ok: false });
      expect(names()).toEqual(before);
      expect((await library.readTranscript(id)).speakers[0]?.userNamed).toBe(false);
    }
  });

  it('drops a suggestion when its profile is deleted or merged away', async () => {
    const p = profile();
    const q = profile({ name: 'Invented other', embedding: new Float32Array([0, 1]) });
    const result = transcript([at(0.5), [0.3, 0.9539392]]);
    const id = await seed(result);
    await match(id, result);
    expect((await list(id)).length).toBeGreaterThan(0);
    await dispatchCall(handlers(), 'mergeSpeakers', { kind: 'profiles', from: p.id, into: q.id });
    expect((await list(id)).some((s) => s.profileId === p.id)).toBe(false);
    await dispatchCall(handlers(), 'deleteProfile', { profileId: q.id });
    expect(await list(id)).toEqual([]);
  });

  it('drops a suggestion when the speaker is named by hand', async () => {
    profile();
    const result = transcript([at(0.5)]);
    const id = await seed(result);
    await match(id, result);
    await library.renameSpeaker(id, 's0', 'Someone else');
    expect(await list(id)).toEqual([]);
  });

  it('purging the meeting voice data removes its suggestions', async () => {
    profile();
    const result = transcript([at(0.5)]);
    const id = await seed(result);
    await match(id, result);
    expect(existsSync(library.meetingPaths(id).suggestions)).toBe(true);
    expect((await library.deleteAudio(id)).ok).toBe(true);
    expect(existsSync(library.meetingPaths(id).suggestions)).toBe(false);
    expect(await list(id)).toEqual([]);
  });

  it('a new pass replaces the previous pass suggestions', async () => {
    profile();
    const result = transcript([at(0.5)]);
    const id = await seed(result);
    await match(id, result);
    expect(await list(id)).toHaveLength(1);
    await library.saveVoices(id, { modelId: APPROVED_PROFILE_MODEL, speakers: [] });
    expect(existsSync(library.meetingPaths(id).suggestions)).toBe(false);
    const far = transcript([[0, 1]]);
    await match(id, far);
    expect(await list(id)).toEqual([]);
  });
});
