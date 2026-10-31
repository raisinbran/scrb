// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Library } from '@scrb/storage';
import { dispatchCall, type CallHandlers } from './dispatch.ts';
import { createMeetingHandlers } from './meetings.ts';

const MS = 1_000_000;

describe('createMeetingHandlers', () => {
  let library: Library;
  let handlers: CallHandlers;

  beforeEach(async () => {
    library = await Library.open({ root: mkdtempSync(join(tmpdir(), 'scrb-meetings-')) });
    handlers = createMeetingHandlers(library);
  });

  afterEach(() => library.close());

  const call = (
    name:
      | 'listMeetings'
      | 'getMeeting'
      | 'getTranscript'
      | 'deleteMeeting'
      | 'updateTerm'
      | 'searchMeetings'
      | 'getUndoState'
      | 'retryFinalPass',
    request: unknown,
  ) => dispatchCall(handlers, name, request);

  const value = async (name: Parameters<typeof call>[0], request: unknown) => {
    const envelope = await call(name, request);
    if (!envelope.ok) throw new Error(envelope.error.message);
    return envelope.value;
  };

  const recorded = (title: string, date: string) =>
    library.createMeeting({ title, date, source: 'recorded', status: 'ready', durationMs: 5000 });

  it('maps library rows to list items, newest first', async () => {
    const older = await recorded('Older', '2026-10-01T10:00:00.000Z');
    const newer = await library.createMeeting({
      title: 'Newer',
      date: '2026-10-02T10:00:00.000Z',
      source: 'imported',
      status: 'recovered',
      durationMs: 9000,
    });
    expect(await value('listMeetings', {})).toEqual([
      {
        id: newer.id,
        title: 'Newer',
        startedAt: newer.date,
        durationMs: 9000,
        origin: 'imported',
        status: 'recovered',
        summaryState: 'notGenerated',
        speakerCount: 0,
      },
      expect.objectContaining({ id: older.id, origin: 'recorded', status: 'ready' }),
    ]);
  });

  it('returns final text, and speakers with the You kind', async () => {
    const { id: meetingId } = await recorded('Spoken', '2026-10-03T10:00:00.000Z');
    await library.applyFinalPass(meetingId, {
      segments: [
        {
          id: 's1',
          speakerId: 'you',
          track: 'microphone',
          pass: 'final',
          words: [{ id: 'w1', text: 'hello', startMs: 10, endMs: 20 }],
        },
      ],
      speakers: [
        {
          id: 'you',
          label: 'You',
          name: null,
          profileId: null,
          userNamed: false,
          mergedInto: null,
        },
      ],
    });
    expect(await value('getTranscript', { meetingId, offset: 0, limit: 10 })).toMatchObject({
      totalSegments: 1,
      totalWords: 1,
      speakers: [{ id: 'you', label: 'You', kind: 'you' }],
      segments: [
        {
          track: 'microphone',
          startMs: 10,
          endMs: 20,
          words: [{ id: 'w1', text: 'hello', state: 'final', correctionId: null }],
        },
      ],
    });
  });

  it('shows transcriptionFailed without masking its status', async () => {
    const { id: meetingId } = await recorded('Failed', '2026-10-04T10:00:00.000Z');
    await library.updateMeeting(meetingId, {
      status: 'transcriptionFailed',
      transcriptionFailure:
        'Transcription could not run because its tools or models are missing. Your audio is saved.',
    });
    expect(await value('getMeeting', { meetingId })).toMatchObject({
      status: 'transcriptionFailed',
      transcriptionFailure:
        'Transcription could not run because its tools or models are missing. Your audio is saved.',
      hasAudio: false,
    });
    expect(await call('getTranscript', { meetingId, offset: 0, limit: 10 })).toEqual({
      ok: false,
      error: {
        code: 'internal',
        message:
          'Transcription could not run because its tools or models are missing. Your audio is saved.',
      },
    });
  });

  it('does not expose worker output, names or paths as a transcription failure', async () => {
    const { id } = await recorded('Synthetic', '2026-10-04T10:00:00.000Z');
    await library.updateMeeting(id, {
      status: 'transcriptionFailed',
      transcriptionFailure: 'Worker /Users/private/demo.m4a printed invented spoken names',
    });
    const detail = await value('getMeeting', { meetingId: id });
    expect(detail).toMatchObject({
      transcriptionFailure: 'Transcription stopped because of an error. Your audio is saved.',
    });
    expect(JSON.stringify(detail)).not.toContain('/Users/private');
    const page = await call('getTranscript', { meetingId: id, offset: 0, limit: 5 });
    expect(JSON.stringify(page)).not.toContain('/Users/private');
  });

  it('keeps segment ids for filtered searches, so a match can jump to its words', async () => {
    const recordedMeeting = await recorded('Synthetic recorded', '2026-10-15T10:00:00.000Z');
    await library.applyFinalPass(recordedMeeting.id, {
      segments: [
        {
          id: 'seg-search',
          track: 'meeting',
          speakerId: 'speaker',
          pass: 'final',
          words: [{ id: 'word-search', text: 'InventedSearch', startMs: 10, endMs: 40 }],
        },
      ],
      speakers: [
        {
          id: 'speaker',
          label: 'Speaker 1',
          name: null,
          profileId: null,
          userNamed: false,
          mergedInto: null,
        },
      ],
    });
    await library.createMeeting({
      title: 'InventedSearch imported',
      date: '2026-10-15T10:00:00.000Z',
      source: 'imported',
      status: 'ready',
    });
    expect(
      await value('searchMeetings', {
        query: 'InventedSearch',
        filter: { origin: 'recorded', from: '2026-10-15', to: '2026-10-15' },
      }),
    ).toMatchObject([
      {
        meeting: { id: recordedMeeting.id },
        matches: [{ segmentId: 'seg-search', startMs: 10 }],
      },
    ]);
    expect(
      await value('searchMeetings', {
        query: 'InventedSearch',
        filter: { from: '2026-10-16' },
      }),
    ).toEqual([]);
  });

  it('only retries a failed pass with sealed audio and an available queue', async () => {
    const meeting = await recorded('Synthetic retry', '2026-10-15T10:00:00.000Z');
    await library.updateMeeting(meeting.id, { status: 'transcriptionFailed' });
    expect(await call('retryFinalPass', { meetingId: meeting.id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    const paths = library.meetingPaths(meeting.id);
    writeFileSync(join(paths.audioMicrophone, '000.opus'), 'invented');
    writeFileSync(
      join(paths.audioMicrophone, 'chunks.json'),
      JSON.stringify({
        chunks: [{ file: '000.opus', startNs: 0, endNs: 1_000_000 }],
      }),
    );
    const enqueue = vi.fn();
    const events = vi.fn();
    handlers = createMeetingHandlers(library, events, undefined, { enqueue } as never);
    expect(await call('retryFinalPass', { meetingId: meeting.id })).toMatchObject({ ok: true });
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(meeting.id);
    await library.updateMeeting(meeting.id, { status: 'transcriptionFailed' });
    enqueue.mockClear();
    await Promise.all([
      call('retryFinalPass', { meetingId: meeting.id }),
      call('retryFinalPass', { meetingId: meeting.id }),
    ]);
    expect(enqueue).toHaveBeenCalledExactlyOnceWith(meeting.id);
    expect(events).toHaveBeenCalledWith(
      'meetingChanged',
      expect.objectContaining({
        id: meeting.id,
        status: 'finalPassRunning',
      }),
    );
    expect(await call('retryFinalPass', { meetingId: meeting.id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
  });

  it('applies the origin and date filter', async () => {
    const october = await recorded('October', '2026-10-15T10:00:00.000Z');
    await recorded('November', '2026-11-15T10:00:00.000Z');
    const filter = { origin: 'recorded', from: '2026-10-15', to: '2026-10-15' };
    expect(await value('listMeetings', { filter })).toMatchObject([{ id: october.id }]);
    expect(await value('listMeetings', { filter: { origin: 'imported' } })).toEqual([]);
  });

  it('merges gaps from both tracks and pauses in timeline order, in milliseconds', async () => {
    const meeting = await recorded('Gaps', '2026-10-15T10:00:00.000Z');
    const { audio, audioMicrophone, audioMeeting } = library.meetingPaths(meeting.id);
    const span = (kind: string, track: string, startMs: number, endMs: number) => ({
      kind,
      track,
      startNs: startMs * MS,
      endNs: endMs * MS,
    });
    writeFileSync(
      join(audioMeeting, 'chunks.json'),
      JSON.stringify({ gaps: [span('possiblyMissing', 'meeting', 3000, 3500)] }),
    );
    writeFileSync(
      join(audioMicrophone, 'chunks.json'),
      JSON.stringify({ gaps: [span('audioMissing', 'microphone', 1000, 1500.4)] }),
    );
    writeFileSync(
      join(audio, 'session.log'),
      [
        { event: 'pause', atNs: 2000 * MS, seq: 1 },
        { event: 'resume', atNs: 2500 * MS, seq: 2 },
      ]
        .map((line) => JSON.stringify(line))
        .join('\n'),
    );

    const detail = await value('getMeeting', { meetingId: meeting.id });
    expect(detail).toMatchObject({
      id: meeting.id,
      gaps: [
        { kind: 'audioMissing', track: 'microphone', startMs: 1000, endMs: 1500 },
        { kind: 'paused', track: 'both', startMs: 2000, endMs: 2500 },
        { kind: 'possiblyMissing', track: 'meeting', startMs: 3000, endMs: 3500 },
      ],
    });
    expect(detail).not.toHaveProperty('recoveredEndMs');
  });

  it('has no gaps before the audio is sealed, and marks where a recovered meeting ended', async () => {
    const meeting = await library.createMeeting({
      title: 'Crashed',
      source: 'recorded',
      status: 'recovered',
      durationMs: 7000,
    });
    expect(await value('getMeeting', { meetingId: meeting.id })).toMatchObject({
      gaps: [],
      recoveredEndMs: 7000,
    });
  });

  it('still opens a meeting whose gap record is damaged', async () => {
    const meeting = await recorded('Damaged', '2026-10-15T10:00:00.000Z');
    const { audioMeeting } = library.meetingPaths(meeting.id);
    mkdirSync(audioMeeting, { recursive: true });
    writeFileSync(join(audioMeeting, 'chunks.json'), '{ cut off');
    expect(await value('getMeeting', { meetingId: meeting.id })).toMatchObject({ gaps: [] });
  });

  it('gives a real meeting an empty transcript and summary', async () => {
    const { id: meetingId } = await recorded('Empty', '2026-10-15T10:00:00.000Z');
    expect(await value('getTranscript', { meetingId, offset: 0, limit: 10 })).toEqual({
      meetingId,
      revision: 0,
      totalSegments: 0,
      totalWords: 0,
      segments: [],
      speakers: [],
    });
    expect(await dispatchCall(handlers, 'getSummary', { meetingId })).toMatchObject({
      ok: true,
      value: {
        meetingId,
        state: 'notGenerated',
        narrative: { brief: null, full: null },
        actionItems: [],
      },
    });
  });

  it('corrects a saved phrase, re-edits it, and keeps undo/redo state', async () => {
    const meeting = await recorded('Synthetic', '2026-10-15T10:00:00.000Z');
    const meetingId = meeting.id;
    await library.appendSegments(meetingId, [
      {
        id: 's1',
        track: 'meeting',
        speakerId: 'person',
        pass: 'live',
        words: [
          { id: 'a', text: 'red', startMs: 10, endMs: 20 },
          { id: 'b', text: 'blue', startMs: 21, endMs: 30 },
          { id: 'c', text: 'green', startMs: 31, endMs: 40 },
        ],
      },
    ]);
    const change = (firstWordId: string, lastWordId: string, text: string) =>
      dispatchCall(handlers, 'applyCorrection', {
        meetingId,
        range: { firstWordId, lastWordId },
        text,
        remember: false,
      });
    expect(await change('a', 'b', 'purple')).toMatchObject({
      ok: true,
      value: { canUndo: true, canRedo: false },
    });
    const page = await value('getTranscript', { meetingId, offset: 0, limit: 10 });
    expect(page).toMatchObject({
      segments: [{ words: [{ id: 'a', text: 'purple', state: 'corrected' }, { id: 'c' }] }],
    });
    expect(await change('b', 'c', 'wrong')).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(await change('a', 'a', 'violet')).toMatchObject({ ok: true });
    expect((await library.readTranscript(meetingId)).corrections[0]).toMatchObject({
      replacement: 'violet',
      original: { text: 'red blue' },
    });
    expect(await dispatchCall(handlers, 'undo', { meetingId })).toMatchObject({
      ok: true,
      value: { canUndo: true, canRedo: true },
    });
    expect(await dispatchCall(handlers, 'redo', { meetingId })).toMatchObject({
      ok: true,
      value: { canUndo: true, canRedo: false },
    });
  });

  it('emits revisioned transcript changes only after a persisted correction', async () => {
    const meetingId = (await recorded('Events', '2026-10-15T10:00:00.000Z')).id;
    await library.appendSegments(meetingId, [
      {
        id: 's1',
        track: 'meeting',
        speakerId: 'person',
        pass: 'live',
        words: [{ id: 'w1', text: 'original', startMs: 1, endMs: 2 }],
      },
    ]);
    const revisions: number[] = [];
    const emitting = createMeetingHandlers(library, (name, payload) => {
      if (name === 'transcriptChanged') revisions.push((payload as { revision: number }).revision);
    });
    const result = await dispatchCall(emitting, 'applyCorrection', {
      meetingId,
      range: { firstWordId: 'w1', lastWordId: 'w1' },
      text: 'changed',
      remember: true,
    });
    expect(result).toMatchObject({ ok: true });
    expect(revisions).toEqual([(await library.readTranscript(meetingId)).revision]);
  });

  it('deletes a recorded meeting and verifies the folder and index are gone', async () => {
    const { id: meetingId } = await recorded('Remove', '2026-10-15T10:00:00.000Z');
    expect(await dispatchCall(handlers, 'deleteMeeting', { meetingId })).toEqual({
      ok: true,
      value: { verified: true, remaining: [] },
    });
    expect(library.listMeetings()).toHaveLength(0);
  });

  it.each(['recording', 'importing', 'finalPassRunning'] as const)(
    'refuses to delete a meeting with active status %s',
    async (status) => {
      const meeting = await library.createMeeting({ title: 'Busy', status });
      const result = await dispatchCall(handlers, 'deleteMeeting', { meetingId: meeting.id });
      expect(result).toMatchObject({ ok: false, error: { code: 'conflict' } });
      expect(library.listMeetings()).toHaveLength(1);
    },
  );

  it('names what a failed delete left in plain language, not as paths', async () => {
    const meeting = await recorded('Stuck', '2026-10-15T10:00:00.000Z');
    const spy = vi.spyOn(library, 'deleteMeeting').mockResolvedValue({
      meetingId: meeting.id,
      ok: false,
      remaining: [join(library.paths.root, 'meetings', '.deleting-x')],
    });
    expect(await value('deleteMeeting', { meetingId: meeting.id })).toEqual({
      verified: false,
      remaining: ['Meeting files'],
    });
    spy.mockRestore();
  });

  it('opens a meeting after its audio folder is removed', async () => {
    const meeting = await recorded('No audio', '2026-10-15T10:00:00.000Z');
    await library.deleteAudio(meeting.id);
    expect(await value('getMeeting', { meetingId: meeting.id })).toMatchObject({ gaps: [] });
  });

  it('removes deleted profile links from stored speakers and saved history', async () => {
    const meeting = await recorded('Voice test', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    await library.applyFinalPass(meeting.id, {
      segments: [
        {
          id: 's1',
          track: 'meeting',
          speakerId: 'speaker-1',
          pass: 'final',
          words: [{ id: 'w1', text: 'synthetic', startMs: 0, endMs: 100 }],
        },
      ],
      speakers: [
        {
          id: 'speaker-1',
          label: 'Speaker 1',
          name: 'Demo',
          profileId: profile.id,
          userNamed: true,
          mergedInto: null,
        },
      ],
    });
    await library.renameSpeaker(meeting.id, 'speaker-1', 'Renamed demo');
    const result = await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id });
    expect(result).toMatchObject({ ok: true });
    expect(library.voiceProfiles.get(profile.id)).toBeNull();

    const stored = await library.readTranscript(meeting.id);
    expect(stored.speakers[0]?.profileId).toBeNull();
    for (const entry of [...stored.undoStack, ...stored.redoStack]) {
      for (const patch of entry.speakers) {
        expect(patch.before?.profileId ?? null).toBeNull();
        expect(patch.after?.profileId ?? null).toBeNull();
      }
    }
    await library.undo(meeting.id);
    expect((await library.readTranscript(meeting.id)).speakers[0]?.profileId).toBeNull();

    await library.redo(meeting.id);
    expect((await library.readTranscript(meeting.id)).speakers[0]?.profileId).toBeNull();
  });

  it('removes a deleted profile link waiting in redo history', async () => {
    const meeting = await recorded('Voice redo', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    await library.applyFinalPass(meeting.id, {
      segments: [],
      speakers: [
        {
          id: 'speaker-1',
          label: 'Speaker 1',
          name: 'Demo',
          profileId: profile.id,
          userNamed: true,
          mergedInto: null,
        },
      ],
    });
    await library.renameSpeaker(meeting.id, 'speaker-1', 'Renamed demo');
    await library.undo(meeting.id);
    await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id });
    await library.redo(meeting.id);
    expect((await library.readTranscript(meeting.id)).speakers[0]?.profileId).toBeNull();
  });

  it('skips a damaged transcript, logs safely, unlinks a readable one, and deletes the profile', async () => {
    const broken = await recorded('Synthetic corrupt', '2026-10-15T10:00:00.000Z');
    const readable = await recorded('Synthetic intact', '2026-10-16T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'synthetic-model',
      embedding: new Float32Array([1, 0]),
      meetingId: broken.id,
    });
    library.voiceProfiles.grow(profile.id, new Float32Array([1, 0]), 1, readable.id);
    await library.appendSegments(
      readable.id,
      [],
      [
        {
          id: 'speaker-a',
          label: 'Speaker 1',
          name: null,
          profileId: profile.id,
          userNamed: false,
          mergedInto: null,
        },
      ],
    );
    writeFileSync(
      library.meetingPaths(broken.id).transcript,
      '{"schemaVersion":2,"secret":"invented speech"',
    );

    expect(await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id })).toMatchObject({
      ok: true,
    });
    expect(library.voiceProfiles.get(profile.id)).toBeNull();
    expect((await library.readTranscript(readable.id)).speakers[0]?.profileId).toBeNull();
    await library.logger.flush();
    const log = await import('node:fs/promises').then(({ readFile }) =>
      readFile(
        join(library.paths.logs, 'scrb-' + new Date().toISOString().slice(0, 10) + '.log'),
        'utf8',
      ),
    );
    expect(log).toContain('profile-unlink-transcript-unreadable');
    expect(log).not.toContain('invented speech');
  });

  it.each(['recording', 'importing', 'finalPassRunning'] as const)(
    'refuses profile deletion for a busy damaged %s transcript',
    async (status) => {
      const meeting = await library.createMeeting({ title: 'Synthetic busy', status });
      const profile = library.voiceProfiles.create({
        modelId: 'synthetic-model',
        embedding: new Float32Array([1, 0]),
        meetingId: meeting.id,
      });
      writeFileSync(library.meetingPaths(meeting.id).transcript, '{not valid');
      expect(
        await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id }),
      ).toMatchObject({
        ok: false,
        error: { code: 'conflict' },
      });
      expect(library.voiceProfiles.get(profile.id)).not.toBeNull();
    },
  );

  it('still deletes a profile linked to a meeting whose transcription failed', async () => {
    const meeting = await recorded('Failed', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    await library.appendSegments(
      meeting.id,
      [],
      [
        {
          id: 'speaker-1',
          label: 'Speaker 1',
          name: 'Demo',
          profileId: profile.id,
          userNamed: true,
          mergedInto: null,
        },
      ],
    );
    await library.updateMeeting(meeting.id, { status: 'transcriptionFailed' });

    expect(await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id })).toMatchObject({
      ok: true,
    });
    expect(library.voiceProfiles.get(profile.id)).toBeNull();
  });

  it('does not flag a summary as outdated when a voice profile is unlinked', async () => {
    const meeting = await recorded('Summary', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    await library.applyFinalPass(meeting.id, {
      segments: [],
      speakers: [
        {
          id: 'speaker-1',
          label: 'Speaker 1',
          name: 'Demo',
          profileId: profile.id,
          userNamed: true,
          mergedInto: null,
        },
      ],
    });
    await library.saveGeneratedSummary(meeting.id, {
      generatedAt: null,
      brief: null,
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    });
    await dispatchCall(handlers, 'deleteProfile', { profileId: profile.id });
    expect((await library.readSummary(meeting.id))?.outdated).toBe(false);
  });

  it('gives a real date for a profile whose meetings were all deleted', async () => {
    const meeting = await recorded('Gone', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    await library.deleteMeeting(meeting.id);
    const result = await dispatchCall(handlers, 'listProfiles', undefined);
    expect(result).toMatchObject({ ok: true, value: [{ lastHeardAt: profile.updatedAt }] });
  });

  it('derives lastHeardAt from meetings rather than renaming the voice profile', async () => {
    const meeting = await recorded('Voice', '2026-10-15T10:00:00.000Z');
    const profile = library.voiceProfiles.create({
      modelId: 'invented-model',
      embedding: new Float32Array([1, 0]),
      meetingId: meeting.id,
    });
    const before = await dispatchCall(handlers, 'listProfiles', undefined);
    library.voiceProfiles.rename(profile.id, 'Renamed');
    const after = await dispatchCall(handlers, 'listProfiles', undefined);
    expect(before).toMatchObject({ ok: true });
    expect(after).toMatchObject({ ok: true });
    if (before.ok && after.ok) {
      const first = (before.value as { lastHeardAt: string | null }[])[0];
      const next = (after.value as { lastHeardAt: string | null }[])[0];
      expect(first?.lastHeardAt).toBe(meeting.date);
      expect(next?.lastHeardAt).toBe(first?.lastHeardAt);
    }
  });

  it('returns the whole term from updateTerm and refuses a duplicate name', async () => {
    const first = library.vocabulary.remember({ term: 'Rosmont' });
    library.vocabulary.remember({ term: 'Quillon' });
    expect(await value('updateTerm', { id: first.id, patch: { enabled: false } })).toEqual(
      expect.objectContaining({ enabled: false, history: expect.any(Array) }),
    );
    expect(
      await dispatchCall(handlers, 'updateTerm', { id: first.id, patch: { term: 'quillon' } }),
    ).toMatchObject({ ok: false, error: { code: 'conflict' } });
  });

  it('tells the UI the summary is outdated after undo as well as an edit', async () => {
    const events: string[] = [];
    const emitting = createMeetingHandlers(library, (name) => void events.push(name));
    const meeting = await recorded('Summary', '2026-10-15T10:00:00.000Z');
    await library.appendSegments(meeting.id, [
      {
        id: 's1',
        track: 'meeting',
        speakerId: 'person',
        pass: 'live',
        words: [{ id: 'w1', text: 'hello', startMs: 0, endMs: 100 }],
      },
    ]);
    const edit = {
      meetingId: meeting.id,
      range: { firstWordId: 'w1', lastWordId: 'w1' },
      text: 'Hullo',
      remember: false,
    };
    expect((await dispatchCall(emitting, 'applyCorrection', edit)).ok).toBe(true);
    vi.spyOn(library, 'readSummary').mockResolvedValue({} as never);
    events.length = 0;
    expect((await dispatchCall(emitting, 'undo', { meetingId: meeting.id })).ok).toBe(true);
    expect(events).toContain('summaryOutdated');
  });

  it('opens a real meeting folder but refuses a link that leaves the library', async () => {
    const opened: string[] = [];
    const opening = createMeetingHandlers(library, undefined, async (folder) => {
      opened.push(folder);
      return '';
    });
    const meeting = await recorded('Folders', '2026-10-15T10:00:00.000Z');
    const paths = library.meetingPaths(meeting.id);
    const open = (folder: string) =>
      dispatchCall(opening, 'openMeetingFolder', { meetingId: meeting.id, folder });
    expect((await open('meeting')).ok).toBe(true);
    expect(opened).toHaveLength(1);
    rmSync(paths.exports, { recursive: true });
    symlinkSync(tmpdir(), paths.exports);
    expect(await open('exports')).toMatchObject({
      ok: false,
      error: { code: 'permissionDenied' },
    });
    expect(opened).toHaveLength(1);
  });

  it('refuses deletion while an audio writer lock exists', async () => {
    const meeting = await recorded('Locked', '2026-10-15T10:00:00.000Z');
    writeFileSync(join(library.meetingPaths(meeting.id).audio, 'writer.lock'), 'synthetic');
    expect(await dispatchCall(handlers, 'deleteMeeting', { meetingId: meeting.id })).toMatchObject({
      ok: false,
      error: { code: 'conflict' },
    });
    expect(library.listMeetings()).toHaveLength(1);
  });

  it('audio-only deletion removes session logs and metadata, retaining transcript and meeting', async () => {
    const meeting = await recorded('Audio', '2026-10-15T10:00:00.000Z');
    const audio = library.meetingPaths(meeting.id).audio;
    writeFileSync(join(audio, 'session.log'), 'synthetic');
    writeFileSync(join(audio, 'session.json'), '{"synthetic":true}');
    const result = await library.deleteAudio(meeting.id);
    expect(result).toMatchObject({ ok: true, remaining: [] });
    expect((await library.getMeeting(meeting.id)).audioDeletedAt).not.toBeNull();
    expect((await library.readTranscript(meeting.id)).meetingId).toBe(meeting.id);
    expect(await library.deleteAudio(meeting.id)).toMatchObject({ ok: true });
  });

  it.each(['getMeeting', 'getSummary', 'deleteMeeting'] as const)(
    'reports an unknown meeting as notFound from %s',
    async (name) => {
      const envelope = await dispatchCall(handlers, name, { meetingId: 'meeting-long' });
      expect(envelope).toMatchObject({ ok: false, error: { code: 'notFound' } });
    },
  );
});
