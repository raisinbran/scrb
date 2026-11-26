import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Library } from '@scrb/storage';
import { minProfileSegments, renameLearning, silentGrowCosine } from './profile-learning.ts';
import { APPROVED_PROFILE_MODEL } from './profile-matching.ts';

const vec = (...v: number[]): Float32Array => Float32Array.from(v);
/** A unit vector at a set cosine to (1, 0, 0). */
const at = (cos: number): Float32Array => vec(cos, Math.sqrt(1 - cos * cos), 0);

let root: string;
let seedMeeting = '';
let library: Library;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'scrb-learning-'));
  library = await Library.open({ root: join(root, 'library') });
  seedMeeting = (await library.createMeeting({ title: 'Earlier', status: 'ready' })).id;
});
afterEach(() => library.close());

/** A ready meeting: speakers a and b, voices as given (embedding, segments). */
async function meeting(
  voices: Record<string, [Float32Array, number]>,
  modelId = APPROVED_PROFILE_MODEL,
  mark: (
    id: string,
  ) => Partial<{ profileId: string; userNamed: boolean; name: string }> = () => ({}),
): Promise<string> {
  const { id } = await library.createMeeting({ title: 'Invented', status: 'ready' });
  const ids = Object.keys(voices);
  await library.appendSegments(
    id,
    ids.map((s, i) => ({
      id: `seg-${s}`,
      speakerId: s,
      track: 'meeting' as const,
      pass: 'final' as const,
      words: [{ id: `w-${s}`, text: 'invented', startMs: i * 5000, endMs: i * 5000 + 400 }],
    })),
    ids.map((s) => ({
      id: s,
      label: `Speaker ${s}`,
      name: null,
      profileId: null,
      userNamed: false,
      mergedInto: null,
      ...mark(s),
    })),
  );
  await library.saveVoices(id, {
    modelId,
    speakers: ids.map((s) => ({
      speakerId: s,
      embedding: (voices[s] as [Float32Array, number])[0],
      segments: (voices[s] as [Float32Array, number])[1],
    })),
  });
  return id;
}

/** A profile that stands on one earlier meeting's contribution, as every real profile does. */
const profile = (name: string | null, embedding = vec(1, 0, 0), sampleCount = 10) => {
  const made = library.voiceProfiles.create({
    ...(name === null ? {} : { name }),
    modelId: APPROVED_PROFILE_MODEL,
    embedding,
    sampleCount,
  });
  library.voiceProfiles.setContribution({
    profileId: made.id,
    meetingId: seedMeeting,
    embedding,
    sampleCount,
    modelId: APPROVED_PROFILE_MODEL,
  });
  return made;
};

const rename = (id: string, speaker: string, name: string, accept?: string) =>
  library.renameSpeaker(
    id,
    speaker,
    name,
    renameLearning(accept === undefined ? {} : { acceptProfileId: accept }),
  );

const speakerOf = async (id: string, s: string) =>
  (await library.readTranscript(id)).speakers.find((x) => x.id === s);

describe('rename learning', () => {
  it('creates a profile from a hand rename', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    const sp = await speakerOf(id, 'a');
    const p = library.voiceProfiles.get(sp?.profileId ?? '');
    expect(p).toMatchObject({ name: 'Invented Ann', sampleCount: 10, meetingIds: [id] });
    expect(library.voiceProfiles.contribution(p?.id ?? '', id)).toMatchObject({ sampleCount: 10 });
  });

  it('grows a same-name profile at or above the gate (case-insensitive)', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [at(silentGrowCosine + 0.05), 10] });
    await rename(id, 'a', 'invented ann');
    expect((await speakerOf(id, 'a'))?.profileId).toBe(p.id);
    expect(library.voiceProfiles.list()).toHaveLength(1);
    expect(library.voiceProfiles.get(p.id)?.sampleCount).toBe(20);
    expect(library.voiceProfiles.contribution(p.id, id)).not.toBeNull();
  });

  it('makes a second profile below the gate and leaves the first alone', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [at(silentGrowCosine - 0.1), 10] });
    await rename(id, 'a', 'Invented Ann');
    const linked = (await speakerOf(id, 'a'))?.profileId;
    expect(linked).not.toBe(p.id);
    expect(library.voiceProfiles.list()).toHaveLength(2);
    expect(library.voiceProfiles.get(p.id)?.sampleCount).toBe(10);
  });

  it('takes the highest cosine among same-name profiles', async () => {
    profile('Invented Ann', vec(0, 1, 0));
    const near = profile('Invented Ann', at(0.9));
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    expect((await speakerOf(id, 'a'))?.profileId).toBe(near.id);
  });

  it.each([['too few segments', 'a', minProfileSegments - 1]])(
    'does not learn: %s',
    async (_label, s, segments) => {
      const id = await meeting({ [s]: [vec(1, 0, 0), segments] });
      await rename(id, s, 'Invented Ann');
      expect((await speakerOf(id, s))?.userNamed).toBe(true);
      expect((await speakerOf(id, s))?.profileId).toBeNull();
      expect(library.voiceProfiles.list()).toHaveLength(0);
    },
  );

  it('does not learn with a wrong model id, no voices.json, or ignored names', async () => {
    const wrong = await meeting({ a: [vec(1, 0, 0), 10] }, 'other-model');
    await rename(wrong, 'a', 'Invented Ann');
    const none = await meeting({ a: [vec(1, 0, 0), 10] });
    await library.deleteVoices(none);
    await rename(none, 'a', 'Invented Ann');
    const ok = await meeting({ a: [vec(1, 0, 0), 10], b: [vec(0, 1, 0), 10] });
    await rename(ok, 'a', 'You');
    await rename(ok, 'b', ' Speaker 7 ');
    await rename(ok, 'a', '   ');
    expect(library.voiceProfiles.list()).toHaveLength(0);
  });

  it('does not learn from a merged speaker', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10], b: [vec(1, 0, 0), 10] });
    await library.mergeSpeakers(id, 'b', 'a');
    await rename(id, 'b', 'Invented Bo');
    expect(library.voiceProfiles.list()).toHaveLength(0);
  });

  it('accepting a suggestion grows the suggested profile below the gate', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [at(0.46), 10] });
    await rename(id, 'a', 'Invented Ann', p.id);
    expect((await speakerOf(id, 'a'))?.profileId).toBe(p.id);
    expect(library.voiceProfiles.get(p.id)?.sampleCount).toBe(20);
  });

  it('accepting still needs 8 segments', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [at(0.9), 3] });
    await rename(id, 'a', 'Invented Ann', p.id);
    expect(library.voiceProfiles.contribution(p.id, id)).toBeNull();
    expect((await speakerOf(id, 'a'))?.profileId).toBeNull();
  });

  it('an auto match never grows a profile', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [vec(1, 0, 0), 10] }, APPROVED_PROFILE_MODEL, () => ({
      profileId: p.id,
      name: 'Invented Ann',
    }));
    await library.reconcileContributions(id);
    expect(library.voiceProfiles.contribution(p.id, id)).toBeNull();
    expect(library.voiceProfiles.get(p.id)?.sampleCount).toBe(10);
  });

  it('retyping the matched name by hand teaches', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [vec(1, 0, 0), 10] }, APPROVED_PROFILE_MODEL, () => ({
      profileId: p.id,
      name: 'Invented Ann',
    }));
    await rename(id, 'a', 'Invented Ann');
    expect(library.voiceProfiles.contribution(p.id, id)).not.toBeNull();
  });

  it('renaming away unlinks and drops the contribution, but not the profile name', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10], b: [vec(0, 1, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    const first = (await speakerOf(id, 'a'))?.profileId ?? '';
    await rename(id, 'a', 'Invented Cy');
    const second = (await speakerOf(id, 'a'))?.profileId ?? '';
    expect(second).not.toBe(first);
    expect(library.voiceProfiles.get(first)).toBeNull();
    expect(library.voiceProfiles.get(second)?.name).toBe('Invented Cy');
  });

  it('keeps a hand-renamed profile when its last contribution leaves', async () => {
    const p = profile('Invented Ann');
    library.voiceProfiles.rename(p.id, 'Invented Ann');
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    await rename(id, 'a', 'Invented Cy');
    expect(library.voiceProfiles.get(p.id)?.name).toBe('Invented Ann');
  });

  it('undo and redo reconcile the contribution and the link', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    const pid = (await speakerOf(id, 'a'))?.profileId ?? '';
    await library.undo(id);
    expect(await speakerOf(id, 'a')).toMatchObject({ userNamed: false, profileId: null });
    expect(library.voiceProfiles.get(pid)).toBeNull();
    await library.redo(id);
    expect((await speakerOf(id, 'a'))?.profileId).toBe(pid);
    expect(library.voiceProfiles.get(pid)).toBeNull();
    await library.reconcileContributions(id);
    expect((await speakerOf(id, 'a'))?.profileId).toBe(pid);
  });

  it('undo of a grow removes only that contribution', async () => {
    const p = profile('Invented Ann');
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await rename(id, 'a', 'Invented Ann');
    expect(library.voiceProfiles.get(p.id)?.sampleCount).toBe(20);
    await library.undo(id);
    expect(library.voiceProfiles.contribution(p.id, id)).toBeNull();
    expect(library.voiceProfiles.get(p.id)).not.toBeNull();
  });

  it('merging a learned speaker away removes its contribution; deleting the meeting purges', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10], b: [vec(0, 1, 0), 10] });
    await rename(id, 'b', 'Invented Bo');
    const pid = (await speakerOf(id, 'b'))?.profileId ?? '';
    await library.mergeSpeakers(id, 'b', 'a');
    expect(library.voiceProfiles.contribution(pid, id)).toBeNull();
    await rename(id, 'a', 'Invented Ann');
    const aid = (await speakerOf(id, 'a'))?.profileId ?? '';
    expect(library.voiceProfiles.contribution(aid, id)).not.toBeNull();
    await library.deleteMeeting(id, false, true);
    expect(library.voiceProfiles.get(aid)).toBeNull();
  });

  it('a rename without a learning rule behaves as before', async () => {
    const id = await meeting({ a: [vec(1, 0, 0), 10] });
    await library.renameSpeaker(id, 'a', 'Invented Ann');
    expect(library.voiceProfiles.list()).toHaveLength(0);
  });
});
