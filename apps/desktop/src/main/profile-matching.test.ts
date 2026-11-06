// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Library, type TranscriptFile } from '@scrb/storage';
import {
  APPROVED_EMBEDDING_SHA256,
  APPROVED_PROFILE_MODEL,
  FinalPassQueue,
  startProfileMatching,
  toModelReplacement,
} from '@scrb/app-core';
import type { FinalTranscript } from '@scrb/transcription';
import { ImportCoordinator } from './imports.ts';
import { createMeetingHandlers, publishEdit } from './meetings.ts';
import { dispatchCall } from './dispatch.ts';

const at = (score: number) => [score, Math.sqrt(1 - score * score)];
const transcript = (
  vectors = [
    [1, 0],
    [0, 1],
  ],
): FinalTranscript => ({
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
    embeddingSegments: 1,
  })),
  spans: [],
  models: { speech: 'invented', segmentation: 'invented', embedding: 'invented' },
  timing: { transcribeMs: 1, diarizeMs: 1 },
});

function profileHashes(library: Library): string[] {
  const db = new DatabaseSync(library.paths.index, { readOnly: true });
  try {
    return [
      'SELECT id,name,model_id,hex(embedding),sample_count,created_at,updated_at FROM voice_profiles ORDER BY id',
      'SELECT profile_id,meeting_id FROM voice_profile_meetings ORDER BY profile_id,meeting_id',
    ].map((sql) =>
      createHash('sha256')
        .update(JSON.stringify(db.prepare(sql).all()))
        .digest('hex'),
    );
  } finally {
    db.close();
  }
}

describe('verified profile recognition', () => {
  let library: Library;
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'scrb-p4a-'));
    library = await Library.open({ root: join(root, 'library') });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await library.close();
  });
  const profile = (overrides = {}) =>
    library.voiceProfiles.create({
      name: 'Invented name',
      embedding: new Float32Array([1, 0]),
      sampleCount: 8,
      modelId: APPROVED_PROFILE_MODEL,
      ...overrides,
    });
  const seed = async (result = transcript()) => {
    const { id } = await library.createMeeting({ title: 'Invented recognition', status: 'ready' });
    await library.applyFinalPass(id, toModelReplacement(result));
    return id;
  };
  const start = () => startProfileMatching(library, async () => APPROVED_EMBEDDING_SHA256);
  const apply = (job: ReturnType<typeof start>, id: string, result = transcript()) =>
    job(id, result, 'invented-model', new AbortController().signal);

  it.each([0.449999999999, 0.45, 0.599999999999, 0.6, 0.600000000001])(
    'assigns only automatic confidence at %s',
    async (score) => {
      const p = profile();
      const result = transcript([at(score)]);
      const job = start();
      const id = await seed(result);
      const hashes = profileHashes(library);
      await apply(job, id, result);
      expect((await library.readTranscript(id)).speakers[0]?.profileId).toBe(
        score >= 0.6 ? p.id : null,
      );
      expect(profileHashes(library)).toEqual(hashes);
    },
  );

  it.each([
    { name: null },
    { sampleCount: 7 },
    { modelId: 'legacy' },
    { modelId: 'sha256:unapproved' },
  ])('skips ineligible profile %j', async (overrides) => {
    profile(overrides);
    const job = start();
    const id = await seed();
    await apply(job, id);
    expect((await library.readTranscript(id)).undoStack).toEqual([]);
  });

  it.each([
    ['zero', [0, 0]],
    ['empty', []],
    ['NaN', [NaN, 0]],
    ['infinite', [Infinity, 0]],
    ['dimension', [1, 0, 0]],
  ] as const)('skips invalid vectors: %s', async (_, vector) => {
    const invalid = profile({ embedding: new Float32Array(vector.length ? vector : [1, 0]) });
    if (vector.length === 0) {
      const db = new DatabaseSync(library.paths.index);
      try {
        db.prepare('UPDATE voice_profiles SET embedding=zeroblob(0) WHERE id=?').run(invalid.id);
      } finally {
        db.close();
      }
    }
    const id = await seed();
    const job = start();
    await apply(job, id);
    expect((await library.readTranscript(id)).undoStack).toEqual([]);
    const bad = transcript([Array.from(vector)]);
    const badId = await seed(bad);
    library.voiceProfiles.delete(invalid.id);
    profile();
    await apply(start(), badId, bad);
    expect((await library.readTranscript(badId)).undoStack).toEqual([]);
  });

  it('normalizes copies and persists batch redo', async () => {
    const first = profile({ embedding: new Float32Array([4, 0]) });
    const second = profile({ name: 'Invented second', embedding: new Float32Array([0, 3]) });
    const result = transcript([
      [2, 0],
      [0, 5],
    ]);
    const job = start();
    const id = await seed(result);
    const before = await library.readTranscript(id);
    const hashes = profileHashes(library);
    await apply(job, id, result);
    const saved = await library.readTranscript(id);
    expect(saved.speakers.map((s) => [s.profileId, s.name, s.userNamed])).toEqual([
      [first.id, first.name, false],
      [second.id, second.name, false],
    ]);
    expect(saved.undoStack).toHaveLength(1);
    expect(saved.revision).toBe(before.revision + 1);
    expect(saved.segments).toEqual(before.segments);
    await library.undo(id);
    expect((await library.readTranscript(id)).speakers).toEqual(before.speakers);
    await library.close();
    library = await Library.open({ root: join(root, 'library') });
    await library.redo(id);
    expect((await library.readTranscript(id)).speakers).toEqual(saved.speakers);
    expect(profileHashes(library)).toEqual(hashes);
    await library.applyFinalPass(id, toModelReplacement(result));
    expect((await library.readTranscript(id)).undoStack).toEqual([]);
    expect((await library.readTranscript(id)).redoStack).toEqual([]);
  });

  it('preserves manual edits and correction layers', async () => {
    profile();
    const job = start();
    const id = await seed();
    await library.renameSpeaker(id, 's0', 'Manual name');
    await library.mergeSpeakers(id, 's1', 's0');
    const words = (await library.readTranscript(id)).segments[0]!.words;
    await library.applyCorrection(id, {
      wordIds: words.map((w) => w.id),
      replacement: 'Manual correction',
    });
    await library.reassignSpeaker(
      id,
      words.map((w) => w.id),
      's0',
    );
    const before = await library.readTranscript(id);
    await apply(job, id);
    expect(await library.readTranscript(id)).toEqual(before);
  });

  it('skips a stale revision without retry', async () => {
    profile();
    const id = await seed();
    let changed = await library.readTranscript(id);
    const hash = vi.fn(async () => {
      await library.renameSpeaker(id, 's1', 'Concurrent name');
      changed = await library.readTranscript(id);
      return APPROVED_EMBEDDING_SHA256;
    });
    await apply(startProfileMatching(library, hash), id);
    expect(await library.readTranscript(id)).toEqual(changed);
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('refuses changed profile before saving batch', async () => {
    const p = profile();
    const id = await seed();
    const before = await library.readTranscript(id);
    const original = library.assignSpeakerProfiles.bind(library);
    vi.spyOn(library, 'assignSpeakerProfiles').mockImplementationOnce(async (...args) => {
      library.voiceProfiles.rename(p.id, 'Concurrent profile name');
      return original(...args);
    });
    await apply(start(), id);
    expect(await library.readTranscript(id)).toEqual(before);
  });

  it('excludes profiles added after processing starts', async () => {
    const job = start();
    const id = await seed();
    profile({ meetingId: id });
    await apply(job, id);
    await apply(start(), id);
    expect((await library.readTranscript(id)).undoStack).toEqual([]);
  });

  it('checks model file again for each job', async () => {
    profile();
    const path = join(root, 'invented.onnx');
    await writeFile(path, 'not approved');
    const id = await seed();
    const before = await library.readTranscript(id);
    await startProfileMatching(library)(id, transcript(), path, new AbortController().signal);
    expect(await library.readTranscript(id)).toEqual(before);
    const hash = vi.fn(async () => APPROVED_EMBEDDING_SHA256);
    await apply(startProfileMatching(library, hash), id);
    await apply(startProfileMatching(library, hash), id);
    expect(hash).toHaveBeenCalledTimes(2);
  });

  it('inspects an uncertain assignment write', async () => {
    profile();
    const id = await seed();
    const original = library.assignSpeakerProfiles.bind(library);
    vi.spyOn(library, 'assignSpeakerProfiles').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('private name and embedding');
    });
    const log = vi.spyOn(library.logger, 'log');
    await apply(start(), id);
    expect((await library.readTranscript(id)).undoStack).toHaveLength(1);
    expect(log).toHaveBeenCalledWith('warn', 'profile-matching-committed-after-warning', {
      outcome: 'committed',
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private name');
  });

  it('keeps recorded success after matching throws', async () => {
    const { id } = await library.createMeeting({
      title: 'Recorded fixture',
      status: 'finalPassRunning',
    });
    const audio = library.meetingPaths(id).audioMeeting;
    await mkdir(audio, { recursive: true });
    await writeFile(
      join(audio, 'chunks.json'),
      JSON.stringify({ chunks: [{ file: 'invented.opus', startNs: 0, endNs: 2000000000 }] }),
    );
    const queue = new FinalPassQueue(
      library,
      async () => transcript(),
      undefined,
      () => async () => {
        throw new Error('private matching failure');
      },
    );
    queue.enqueue(id);
    await queue.idle();
    expect((await library.getMeeting(id)).status).toBe('ready');
    expect((await library.readTranscript(id)).segments).toHaveLength(2);
  });

  describe('recorded assignment notifications', () => {
    const runRecorded = async (
      notify: typeof publishEdit = publishEdit,
      prepare: typeof startProfileMatching = (store) =>
        startProfileMatching(store, async () => APPROVED_EMBEDDING_SHA256),
    ) => {
      const { id } = await library.createMeeting({
        title: 'Invented recorded notification',
        status: 'finalPassRunning',
      });
      const audio = library.meetingPaths(id).audioMeeting;
      await mkdir(audio, { recursive: true });
      await writeFile(
        join(audio, 'chunks.json'),
        JSON.stringify({ chunks: [{ file: 'invented.opus', startNs: 0, endNs: 2000000000 }] }),
      );
      const timeline: string[] = [];
      const emit = vi.fn();
      library.setMeetingChangedListener((meeting) => {
        if (meeting.status === 'ready') {
          timeline.push('ready');
          emit('meetingChanged', {
            id: meeting.id,
            title: meeting.title,
            startedAt: meeting.date,
            durationMs: meeting.durationMs,
            origin: meeting.source,
            status: meeting.status,
            summaryState: 'notGenerated',
            speakerCount: 0,
          });
        }
      });
      const listener = vi.fn((before: TranscriptFile, after: TranscriptFile) => {
        timeline.push('matching');
        const saved = JSON.parse(
          readFileSync(library.meetingPaths(id).transcript, 'utf8'),
        ) as TranscriptFile;
        expect(saved.revision).toBe(after.revision);
        notify(before, after, emit);
      });
      const queue = new FinalPassQueue(
        library,
        async ({ onEmbeddingModel }) => {
          onEmbeddingModel?.('invented-model');
          return transcript();
        },
        undefined,
        prepare,
        listener,
      );
      queue.enqueue(id);
      await queue.idle();
      return { id, timeline, emit, listener, queue };
    };
    const events = (emit: ReturnType<typeof vi.fn>) =>
      emit.mock.calls.filter(([name]) => name === 'transcriptChanged');

    it('updates an already listening transcript once', async () => {
      const first = profile();
      const second = profile({ name: 'Invented second', embedding: new Float32Array([0, 1]) });
      const hashes = profileHashes(library);
      const observed: unknown[] = [];
      const { id, timeline, emit, listener, queue } = await runRecorded(
        (before, after, publish) => {
          publishEdit(before, after, (name, payload) => {
            if (name === 'transcriptChanged') observed.push(payload);
            publish?.(name, payload);
          });
        },
      );
      const saved = await library.readTranscript(id);
      const [before, after] = listener.mock.calls[0]!;
      expect(timeline).toEqual(['ready', 'matching']);
      expect(emit.mock.calls.map(([name]) => name)).toEqual([
        'meetingChanged',
        'transcriptChanged',
      ]);
      expect(before.revision).toBeLessThan(after.revision);
      expect(after).toEqual(saved);
      expect(observed).toEqual([
        expect.objectContaining({
          meetingId: id,
          revision: saved.revision,
          change: { kind: 'replace', removedSegmentIds: [], segments: [] },
          speakers: [
            expect.objectContaining({ id: 's0', label: first.name, profileId: first.id }),
            expect.objectContaining({ id: 's1', label: second.name, profileId: second.id }),
          ],
        }),
      ]);
      expect(events(emit)).toHaveLength(1);
      expect(saved.undoStack).toHaveLength(1);
      const handlers = createMeetingHandlers(library, emit);
      expect(await dispatchCall(handlers, 'undo', { meetingId: id })).toMatchObject({ ok: true });
      expect(events(emit)).toHaveLength(2);
      expect(await dispatchCall(handlers, 'redo', { meetingId: id })).toMatchObject({ ok: true });
      expect(events(emit)).toHaveLength(3);
      expect(profileHashes(library)).toEqual(hashes);
      queue.enqueue(id);
      await queue.idle();
      expect(events(emit)).toHaveLength(4);
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it.each(['stale', 'exception', 'abort', 'unnamed'] as const)(
      'publishes no false event for %s',
      async (mode) => {
        profile(mode === 'unnamed' ? { name: null } : {});
        const hashes = profileHashes(library);
        const { id, emit, listener } = await runRecorded(publishEdit, (store) => {
          if (mode === 'exception')
            return async () => {
              throw new Error('private failure');
            };
          return async (meetingId, result, path) => {
            const abort = new AbortController();
            const job = startProfileMatching(store, async () => {
              if (mode === 'stale')
                await store.renameSpeaker(meetingId, 's1', 'Concurrent manual name');
              if (mode === 'abort') abort.abort();
              return APPROVED_EMBEDDING_SHA256;
            });
            return job(meetingId, result, path, abort.signal);
          };
        });
        expect((await library.getMeeting(id)).status).toBe('ready');
        expect(
          (await library.readTranscript(id)).speakers.every(
            (speaker) => speaker.profileId === null,
          ),
        ).toBe(true);
        expect(listener).not.toHaveBeenCalled();
        expect(events(emit)).toEqual([]);
        expect(profileHashes(library)).toEqual(hashes);
      },
    );

    it.each(['complete', 'partial', 'advanced', 'unreadable'] as const)(
      'verifies uncertain %s assignment before notifying',
      async (mode) => {
        profile();
        profile({ name: 'Invented second', embedding: new Float32Array([0, 1]) });
        const hashes = profileHashes(library);
        const original = library.assignSpeakerProfiles.bind(library);
        vi.spyOn(library, 'assignSpeakerProfiles').mockImplementationOnce(
          async (id, assignments, revision, signal) => {
            const saved = await original(
              id,
              mode === 'partial' ? assignments.slice(0, 1) : assignments,
              revision,
              signal,
            );
            if (mode === 'advanced') await library.saveTranscript(id, saved, saved.revision);
            if (mode === 'unreadable')
              vi.spyOn(library, 'readTranscript').mockRejectedValueOnce(new Error('private path'));
            throw new Error('uncertain write');
          },
        );
        const log = vi.spyOn(library.logger, 'log');
        const { id, emit, listener } = await runRecorded();
        const saved = await library.readTranscript(id);
        expect((await library.getMeeting(id)).status).toBe('ready');
        expect(saved.speakers.filter((speaker) => speaker.profileId !== null)).toHaveLength(
          mode === 'partial' ? 1 : 2,
        );
        expect(events(emit)).toHaveLength(mode === 'complete' ? 1 : 0);
        expect(listener).toHaveBeenCalledTimes(mode === 'complete' ? 1 : 0);
        expect(library.assignSpeakerProfiles).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith(
          'warn',
          mode === 'complete'
            ? 'profile-matching-committed-after-warning'
            : 'profile-matching-skipped',
          {
            outcome:
              mode === 'complete'
                ? 'committed'
                : mode === 'advanced'
                  ? 'ambiguous'
                  : mode === 'unreadable'
                    ? 'unknown'
                    : 'uncommitted',
          },
        );
        expect(profileHashes(library)).toEqual(hashes);
      },
    );

    it('isolates one notification failure without retry', async () => {
      profile();
      const log = vi.spyOn(library.logger, 'log');
      const { id, emit, listener } = await runRecorded((before, after, publish) => {
        publishEdit(before, after, publish);
        throw new Error('private transcript and name');
      });
      expect((await library.getMeeting(id)).status).toBe('ready');
      expect((await library.readTranscript(id)).speakers[0]?.profileId).not.toBeNull();
      expect((await library.readTranscript(id)).undoStack).toHaveLength(1);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(events(emit)).toHaveLength(1);
      expect(log.mock.calls.filter(([level]) => level === 'warn')).toEqual([
        ['warn', 'profile-matching-notification-failed', {}],
      ]);
    });
  });

  it.each(['throw', 'abort', 'cancel before commit'] as const)(
    'preserves import boundary: %s',
    async (mode) => {
      profile();
      const hashes = profileHashes(library);
      const source = join(root, 'invented.wav');
      await writeFile(source, 'invented audio');
      const emit = vi.fn();
      let abortDone: Promise<unknown> | undefined;
      const controller = new ImportCoordinator({
        library,
        chooseFile: async () => source,
        recordingBusy: () => false,
        privacyBanner: async () => false,
        emit,
        startMatching: (store) =>
          mode === 'throw'
            ? async () => {
                throw new Error('private optional error');
              }
            : startProfileMatching(store, async () => {
                abortDone = controller.handlers.cancelImport!({
                  importId: controller.list()[0]!.importId,
                });
                return APPROVED_EMBEDDING_SHA256;
              }),
        run: async ({ meetingDir, onEmbeddingModel }) => {
          await mkdir(join(meetingDir, 'audio', 'meeting'), { recursive: true });
          await writeFile(join(meetingDir, 'audio', 'meeting', 'chunks.json'), '{"version":1}');
          onEmbeddingModel?.('invented-model');
          if (mode === 'cancel before commit')
            abortDone = controller.handlers.cancelImport!({
              importId: controller.list()[0]!.importId,
            });
          return {
            meetingDir,
            sourceName: 'invented.wav',
            fileDate: new Date(),
            durationMs: 2000,
            truncated: false,
            chunks: [],
            transcript: transcript(),
          };
        },
      });
      const file = (await controller.handlers.pickAudioFile!(undefined)) as { fileToken: string };
      await controller.handlers.importAudioFile!({
        fileToken: file.fileToken,
        buildVoiceProfiles: false,
      });
      // Wait for the externally observable terminal event, without cancelling a healthy import.
      await vi.waitFor(() =>
        expect(
          emit.mock.calls.some(
            ([name]) =>
              name === (mode === 'cancel before commit' ? 'importCancelled' : 'importFinished'),
          ),
        ).toBe(true),
      );
      await abortDone;
      const meetings = library.listMeetings();
      if (mode === 'cancel before commit') {
        expect(meetings).toEqual([]);
        expect(
          await import('node:fs/promises').then((fs) =>
            fs.readdir(join(library.paths.cache, 'imports')),
          ),
        ).toEqual([]);
      } else {
        expect(meetings).toHaveLength(1);
        expect(meetings[0]?.status).toBe('ready');
        const saved = await library.readTranscript(meetings[0]!.id);
        expect(saved.segments).toHaveLength(2);
        expect(saved.undoStack).toEqual([]);
        expect(saved.speakers.every((s) => s.profileId === null)).toBe(true);
      }
      expect(profileHashes(library)).toEqual(hashes);
    },
  );
});
