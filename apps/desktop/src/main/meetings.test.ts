// @vitest-environment node
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

  const call = (name: 'listMeetings' | 'getMeeting' | 'getTranscript', request: unknown) =>
    dispatchCall(handlers, name, request);

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
        { id: 'you', label: 'You', name: null, profileId: null, userNamed: false, mergedInto: null },
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

  it('shows a failed meeting as ready and gives the reason with its transcript', async () => {
    const { id: meetingId } = await recorded('Failed', '2026-10-04T10:00:00.000Z');
    await library.updateMeeting(meetingId, {
      status: 'transcriptionFailed',
      transcriptionFailure: 'Tools are missing. Your audio is saved.',
    });
    expect(await value('getMeeting', { meetingId })).toMatchObject({ status: 'ready' });
    expect(await call('getTranscript', { meetingId, offset: 0, limit: 10 })).toEqual({
      ok: false,
      error: { code: 'internal', message: 'Tools are missing. Your audio is saved.' },
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
    await library.appendSegments(meetingId, [{
      id: 's1', track: 'meeting', speakerId: 'person', pass: 'live',
      words: [
        { id: 'a', text: 'red', startMs: 10, endMs: 20 },
        { id: 'b', text: 'blue', startMs: 21, endMs: 30 },
        { id: 'c', text: 'green', startMs: 31, endMs: 40 },
      ],
    }]);
    const change = (firstWordId: string, lastWordId: string, text: string) =>
      dispatchCall(handlers, 'applyCorrection', {
        meetingId, range: { firstWordId, lastWordId }, text, remember: false,
      });
    expect(await change('a', 'b', 'purple')).toMatchObject({
      ok: true, value: { canUndo: true, canRedo: false },
    });
    const page = await value('getTranscript', { meetingId, offset: 0, limit: 10 });
    expect(page).toMatchObject({
      segments: [{ words: [{ id: 'a', text: 'purple', state: 'corrected' }, { id: 'c' }] }],
    });
    expect(await change('b', 'c', 'wrong')).toMatchObject({
      ok: false, error: { code: 'conflict' },
    });
    expect(await change('a', 'a', 'violet')).toMatchObject({ ok: true });
    expect((await library.readTranscript(meetingId)).corrections[0]).toMatchObject({
      replacement: 'violet', original: { text: 'red blue' },
    });
    expect(await dispatchCall(handlers, 'undo', { meetingId })).toMatchObject({
      ok: true, value: { canUndo: true, canRedo: true },
    });
    expect(await dispatchCall(handlers, 'redo', { meetingId })).toMatchObject({
      ok: true, value: { canUndo: true, canRedo: false },
    });
  });

  it('emits revisioned transcript changes only after a persisted correction', async () => {
    const meetingId = (await recorded('Events', '2026-10-15T10:00:00.000Z')).id;
    await library.appendSegments(meetingId, [{
      id: 's1', track: 'meeting', speakerId: 'person', pass: 'live',
      words: [{ id: 'w1', text: 'original', startMs: 1, endMs: 2 }],
    }]);
    const revisions: number[] = [];
    const emitting = createMeetingHandlers(library, (name, payload) => {
      if (name === 'transcriptChanged') revisions.push((payload as { revision: number }).revision);
    });
    const result = await dispatchCall(emitting, 'applyCorrection', {
      meetingId, range: { firstWordId: 'w1', lastWordId: 'w1' }, text: 'changed', remember: true,
    });
    expect(result).toMatchObject({ ok: true });
    expect(revisions).toEqual([(await library.readTranscript(meetingId)).revision]);
  });

  it('refuses to delete a real meeting and leaves it in place', async () => {
    const { id: meetingId } = await recorded('Keep', '2026-10-15T10:00:00.000Z');
    const envelope = await dispatchCall(handlers, 'deleteMeeting', { meetingId });
    expect(envelope).toEqual({
      ok: false,
      error: {
        code: 'notImplemented',
        message: 'Deleting a recorded meeting is not available yet.',
      },
    });
    expect(library.listMeetings()).toHaveLength(1);
  });

  it.each(['getMeeting', 'getSummary', 'deleteMeeting'] as const)(
    'reports an unknown meeting as notFound from %s',
    async (name) => {
      const envelope = await dispatchCall(handlers, name, { meetingId: 'meeting-long' });
      expect(envelope).toMatchObject({ ok: false, error: { code: 'notFound' } });
    },
  );
});
