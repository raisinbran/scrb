import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContractError,
  CALL_NAMES,
  type TranscriptChanged,
  type TranscriptSegment,
} from '@scrb/contracts';
import { MockBackend } from './mock-backend.ts';
import { DEV_TRIGGERS } from './dev-triggers.ts';
import { LONG_MEETING_ID } from './fixtures.ts';
import { MOCK_SPEAKERS, generateTranscript } from './transcript.ts';

describe('MockBackend', () => {
  let backend: MockBackend;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    backend = new MockBackend();
  });

  afterEach(() => {
    backend.dispose();
    vi.useRealTimers();
  });

  it('implements every contract call', () => {
    const handlers = (backend as unknown as { handlers: Record<string, unknown> }).handlers;
    expect(Object.keys(handlers).sort()).toEqual([...CALL_NAMES].sort());
  });

  it('lists active imports without source tokens and removes cancelled jobs', async () => {
    const picked = await backend.call('pickAudioFile');
    expect(picked).not.toBeNull();
    const { importId } = await backend.call('importAudioFile', {
      fileToken: picked!.fileToken, buildVoiceProfiles: false,
    });
    expect(await backend.call('listImports')).toEqual([expect.objectContaining({
      importId, stage: 'decoding', cancelling: false,
    })]);
    expect(JSON.stringify(await backend.call('listImports'))).not.toContain(picked!.fileToken);
    await backend.call('cancelImport', { importId });
    expect(await backend.call('listImports')).toEqual([]);
  });

  it('runs the scripted meeting: text each second, pause, device change, lag spike', async () => {
    const seen: string[] = [];
    let status = '';
    let appended = 0;
    backend.on('transcriptChanged', ({ change }) => {
      if (change.kind === 'append') appended += 1;
    });
    backend.on('recordingStateChanged', (state) => {
      if (status !== state.status) seen.push(state.status);
      status = state.status;
    });
    backend.on('deviceChanged', () => seen.push('deviceChanged'));
    backend.on('transcriptionLag', (lag) => {
      if (lag.status === 'lagging') seen.push('lagging');
    });

    await backend.call('startRecording', {});
    vi.advanceTimersByTime(70_000);

    expect(seen).toEqual(['recording', 'paused', 'recording', 'deviceChanged', 'lagging']);
    // Five paused seconds produce no text.
    expect(appended).toBe(65);
  });

  it('replays confirmed pause spans in events and snapshots', async () => {
    const seen: number[] = [];
    backend.on('pauseSpansChanged', ({ spans }) => seen.push(spans.length));
    await backend.call('startRecording', {});
    vi.advanceTimersByTime(1_000);
    await backend.call('pauseRecording');
    expect((await backend.call('getRecordingSnapshot')).pauseSpans).toMatchObject([
      { startMs: 1_000, endMs: null, reason: 'user' },
    ]);
    vi.advanceTimersByTime(2_000);
    await backend.call('resumeRecording');
    expect((await backend.call('getRecordingSnapshot')).pauseSpans).toMatchObject([
      { startMs: 1_000, endMs: 3_000, reason: 'user' },
    ]);
    expect(seen).toEqual([1, 1]);
  });

  it('keeps elapsed time still while paused', async () => {
    await backend.call('startRecording', {});
    vi.advanceTimersByTime(18_000);
    const { elapsedMs } = (await backend.call('getRecordingSnapshot')).state;
    expect(elapsedMs).toBe(14_000);
  });

  it('refuses a second recording', async () => {
    await backend.call('startRecording', {});
    await expect(backend.call('startRecording', {})).rejects.toBeInstanceOf(ContractError);
  });

  it('serves an 8-hour transcript of about 80,000 words in pages', async () => {
    const page = await backend.call('getTranscript', {
      meetingId: LONG_MEETING_ID,
      offset: 100,
      limit: 50,
    });
    expect(page.totalWords).toBeGreaterThanOrEqual(80_000);
    expect(page.totalWords).toBeLessThan(81_000);
    expect(page.segments).toHaveLength(50);
    const { durationMs } = generateTranscript('x', 80_000, 1);
    expect(durationMs / 3_600_000).toBeGreaterThan(7.5);
    expect(durationMs / 3_600_000).toBeLessThan(8.5);
  });

  it('generates four speakers', () => {
    expect(MOCK_SPEAKERS).toHaveLength(4);
  });

  it('offers sample summaries, an outdated one and a recovered meeting', async () => {
    const ready = await backend.call('getSummary', { meetingId: LONG_MEETING_ID });
    expect(ready.narrative.brief).not.toBeNull();
    expect(ready.narrative.full).not.toBeNull();
    expect((await backend.call('getSummary', { meetingId: 'meeting-outdated' })).state).toBe(
      'outdated',
    );
    expect((await backend.call('getMeeting', { meetingId: 'meeting-recovered' })).status).toBe(
      'recovered',
    );
  });

  it('removes a meeting, and reports files left behind when that fault is armed', async () => {
    backend.arm('deleteFails');
    const failed = await backend.call('deleteMeeting', { meetingId: 'meeting-outdated' });
    expect(failed.verified).toBe(false);
    const ok = await backend.call('deleteMeeting', { meetingId: 'meeting-outdated' });
    expect(ok.verified).toBe(true);
    await expect(
      backend.call('getMeeting', { meetingId: 'meeting-outdated' }),
    ).rejects.toMatchObject({ code: 'notFound' });
  });

  it('persists settings across instances', async () => {
    await backend.call('updateSettings', { theme: 'dark' });
    expect((await new MockBackend().call('getSettings')).theme).toBe('dark');
  });

  it('merges nested settings without losing siblings', async () => {
    const settings = await backend.call('updateSettings', { audio: { echoCancellation: false } });
    expect(settings.audio.echoCancellation).toBe(false);
    expect(settings.audio.preset).toBe('voiceIsolation');
  });

  it('refuses a malformed request', async () => {
    const failure = await backend
      .call('getTranscript', { meetingId: LONG_MEETING_ID, offset: -1, limit: 10 })
      .catch((error: unknown) => error);
    expect((failure as ContractError).code).toBe('invalidRequest');
  });

  it('restores recording health and transcription status after a reload', async () => {
    await backend.call('startRecording', {});
    const warning = { kind: 'lowDisk', message: 'Low disk.', atMs: 0 } as const;
    backend.emit('recordingHealth', { level: 'warning', warnings: [warning], diskFreeBytes: 1 });
    backend.emit('transcriptionLag', { status: 'lagging', lagMs: 9000 });

    const snapshot = await backend.call('getRecordingSnapshot');

    expect(snapshot.state.status).toBe('recording');
    expect(snapshot.health?.level).toBe('warning');
    expect(snapshot.transcription?.status).toBe('lagging');
  });

  describe('import cancellation', () => {
    const start = async () => {
      const ended: string[] = [];
      backend.on('importFinished', () => ended.push('finished'));
      backend.on('importFailed', () => ended.push('failed'));
      backend.on('importCancelled', () => ended.push('cancelled'));
      const before = (await backend.call('listMeetings', {})).length;
      const { importId } = await backend.call('importAudioFile', {
        fileToken: 'file-1',
        buildVoiceProfiles: false,
      });
      return { ended, before, importId };
    };

    it('ends a running import with one event and creates no meeting', async () => {
      const { ended, before, importId } = await start();
      await backend.call('cancelImport', { importId });
      vi.advanceTimersByTime(5000);
      expect(ended).toEqual(['cancelled']);
      expect(await backend.call('listMeetings', {})).toHaveLength(before);
    });

    it('does nothing when cancelled twice', async () => {
      const { ended, importId } = await start();
      await backend.call('cancelImport', { importId });
      await backend.call('cancelImport', { importId });
      expect(ended).toEqual(['cancelled']);
    });

    it('does nothing once the import has finished', async () => {
      const { ended, importId } = await start();
      vi.advanceTimersByTime(5000);
      await backend.call('cancelImport', { importId });
      expect(ended).toEqual(['finished']);
    });

    it('reports an import that never existed', async () => {
      const failure = await backend
        .call('cancelImport', { importId: 'import-999' })
        .catch((error: unknown) => error);
      expect((failure as ContractError).code).toBe('notFound');
    });
  });

  it('counts transcript revisions per meeting', async () => {
    const seen: number[] = [];
    backend.on('transcriptChanged', ({ revision }) => seen.push(revision));
    const { meetingId } = await backend.call('startRecording', {});
    vi.advanceTimersByTime(3000);
    await backend.call('stopRecording');
    await backend.call('startRecording', {});
    vi.advanceTimersByTime(1000);

    expect(seen).toEqual([1, 2, 3, 1]);
    const page = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
    expect(page.revision).toBe(3);
  });

  it('leaves only the newest live segments provisional', async () => {
    const { meetingId } = await backend.call('startRecording', {});
    vi.advanceTimersByTime(10_000);
    const { segments } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 50 });
    expect(segments.map((segment) => segment.words[0]?.state)).toEqual([
      ...Array<string>(6).fill('final'),
      ...Array<string>(4).fill('provisional'),
    ]);
  });

  it('applies, undoes and redoes a correction across two segments', async () => {
    const { meetingId } = await backend.call('startRecording', {});
    vi.advanceTimersByTime(2000);
    const read = () => backend.call('getTranscript', { meetingId, offset: 0, limit: 10 });
    const original = await read();
    const [first, second] = original.segments as [TranscriptSegment, TranscriptSegment];
    const range = {
      firstWordId: first.words.at(-1)?.id as string,
      lastWordId: second.words[0]?.id as string,
    };

    const state = await backend.call('applyCorrection', {
      meetingId,
      range,
      text: 'Halden Depot rollout',
      remember: true,
    });

    expect(state).toEqual({ canUndo: true, canRedo: false });
    const corrected = (await read()).segments[0] as TranscriptSegment;
    expect(corrected.words.slice(-3).map((word) => word.text)).toEqual([
      'Halden',
      'Depot',
      'rollout',
    ]);
    expect(corrected.words.at(-1)?.state).toBe('corrected');
    expect((await read()).segments[1]?.words[0]?.id).toBe(second.words[1]?.id);
    expect((await backend.call('listTerms')).at(-1)?.term).toBe('Halden Depot rollout');

    expect(await backend.call('undo', { meetingId })).toEqual({ canUndo: false, canRedo: true });
    expect((await read()).segments.slice(0, 2)).toEqual([first, second]);

    await backend.call('redo', { meetingId });
    expect((await read()).segments[0]).toEqual(corrected);
  });

  it('reassigns part of a segment, emits the change, and undoes and redoes it', async () => {
    const { meetingId } = await backend.call('startRecording', {});
    vi.advanceTimersByTime(1000);
    backend.dispose();
    const read = () => backend.call('getTranscript', { meetingId, offset: 0, limit: 10 });
    const original = await read();
    const segment = original.segments[0] as TranscriptSegment;
    const speakerId = segment.speakerId === 'sp-2' ? 'sp-3' : 'sp-2';
    const changes: TranscriptChanged['change'][] = [];
    backend.on('transcriptChanged', ({ change }) => changes.push(change));

    const state = await backend.call('reassignSpeaker', {
      meetingId,
      range: {
        firstWordId: segment.words[1]?.id as string,
        lastWordId: segment.words[2]?.id as string,
      },
      speakerId,
    });

    expect(state).toEqual({ canUndo: true, canRedo: false });
    expect(changes).toHaveLength(1);
    const parts = (await read()).segments;
    expect(parts.map((part) => part.speakerId)).toEqual([
      segment.speakerId,
      speakerId,
      segment.speakerId,
    ]);
    expect(parts.flatMap((part) => part.words)).toEqual(segment.words);
    expect(parts[1]?.words.map((word) => word.text)).toEqual(
      segment.words.slice(1, 3).map((word) => word.text),
    );

    await backend.call('undo', { meetingId });
    expect((await read()).segments).toEqual([segment]);
    expect(changes).toHaveLength(2);

    await backend.call('redo', { meetingId });
    expect((await read()).segments).toEqual(parts);
  });

  it('refuses a reassignment of text that is gone', async () => {
    const failure = await backend
      .call('reassignSpeaker', {
        meetingId: LONG_MEETING_ID,
        range: { firstWordId: 'missing', lastWordId: 'missing' },
        speakerId: 'sp-2',
      })
      .catch((error: unknown) => error);
    expect((failure as ContractError).code).toBe('notFound');
  });

  it('runs a live meeting that already holds 8 hours of text', async () => {
    backend.startLongLiveMeeting();
    const { state } = await backend.call('getRecordingSnapshot');
    const page = await backend.call('getTranscript', {
      meetingId: state.meetingId as string,
      offset: 0,
      limit: 1,
    });
    expect(page.totalWords).toBeGreaterThanOrEqual(80_000);
    expect(state.elapsedMs).toBeGreaterThan(7 * 3_600_000);
  });

  describe('library', () => {
    it('applies date bounds inclusively', async () => {
      const meetings = await backend.call('listMeetings', {
        filter: { from: '2026-10-26', to: '2026-10-27' },
      });
      expect(meetings.map((meeting) => meeting.id).sort()).toEqual([
        'meeting-outdated',
        'meeting-recovered',
      ]);
    });

    it('searches transcript text and returns where it matched', async () => {
      const [first] = await backend.call('searchMeetings', { query: 'northern depot' });
      expect(first?.matches[0]?.snippet).toContain('northern depot');
      expect(first?.matches[0]?.startMs).not.toBeNull();
    });
  });

  describe('import stages', () => {
    it('reports each stage and uses the picked file', async () => {
      const stages: string[] = [];
      let meetingId = '';
      backend.on('importProgress', ({ stage }) => stages.push(stage));
      backend.on('importFinished', (event) => (meetingId = event.meetingId));
      const file = await backend.call('pickAudioFile');
      await backend.call('importAudioFile', {
        fileToken: (file as { fileToken: string }).fileToken,
        buildVoiceProfiles: false,
      });
      vi.advanceTimersByTime(5000);
      expect(stages).toEqual(['decoding', 'transcribing', 'diarizing', 'finishing']);
      expect((await backend.call('getMeeting', { meetingId })).startedAt).toBe(file?.fileDate);
    });

    it('stops an import when a recording starts', async () => {
      const failures: string[] = [];
      backend.on('importFailed', ({ reason }) => failures.push(reason));
      await backend.call('importAudioFile', { fileToken: 'file-1', buildVoiceProfiles: false });
      await backend.call('startRecording', {});
      expect(failures).toEqual(['recordingInProgress']);
    });
  });

  describe('summary', () => {
    const meetingId = 'meeting-outdated';

    it('saves an edit and keeps it through regeneration', async () => {
      const { actionItems } = await backend.call('getSummary', { meetingId });
      const item = { ...(actionItems[0] as (typeof actionItems)[number]), action: 'Changed' };
      const saved = await backend.call('updateSummaryItem', {
        meetingId,
        update: { kind: 'actionItem', item },
      });
      expect(saved.actionItems[0]?.edited).toBe(true);

      await backend.call('generateSummary', { meetingId, length: 'brief' });
      expect((await backend.call('getSummary', { meetingId })).state).toBe('generating');
      vi.advanceTimersByTime(5000);

      const after = await backend.call('getSummary', { meetingId });
      expect(after.state).toBe('edited');
      expect(after.actionItems[0]?.action).toBe('Changed');
    });

    it('applies each kind of submitted item and marks it edited', async () => {
      const before = await backend.call('getSummary', { meetingId });
      const update = (item: Parameters<typeof backend.call<'updateSummaryItem'>>[1]['update']) =>
        backend.call('updateSummaryItem', { meetingId, update: item });
      const [action, decision, question] = [
        before.actionItems[0],
        before.decisions[0],
        before.openQuestions[0],
      ] as [
        (typeof before.actionItems)[number],
        (typeof before.decisions)[number],
        (typeof before.openQuestions)[number],
      ];
      const section = before.narrative.brief?.[0] as NonNullable<
        typeof before.narrative.brief
      >[number];

      await update({
        kind: 'actionItem',
        item: { ...action, owner: 'New owner', status: 'proposed' },
      });
      await update({
        kind: 'decision',
        item: { ...decision, status: 'unresolved', impactArea: null },
      });
      await update({ kind: 'openQuestion', item: { ...question, question: 'New question?' } });
      await update({ kind: 'narrative', item: { ...section, text: 'New text.' } });

      const after = await backend.call('getSummary', { meetingId });
      expect(after.actionItems[0]).toMatchObject({
        owner: 'New owner',
        status: 'proposed',
        edited: true,
      });
      expect(after.decisions[0]).toMatchObject({
        status: 'unresolved',
        impactArea: null,
        edited: true,
      });
      expect(after.openQuestions[0]).toMatchObject({ question: 'New question?', edited: true });
      expect(after.narrative.brief?.[0]).toMatchObject({ text: 'New text.', edited: true });
      expect(after.actionItems[1]).toEqual(before.actionItems[1]);
    });

    it('generates only the requested length', async () => {
      await backend.call('generateSummary', { meetingId: 'meeting-imported', length: 'brief' });
      vi.advanceTimersByTime(5000);
      const { narrative } = await backend.call('getSummary', { meetingId: 'meeting-imported' });
      expect(narrative.brief).not.toBeNull();
      expect(narrative.full).toBeNull();
    });

    it('marks the summary outdated when that event fires', async () => {
      backend.emit('summaryOutdated', { meetingId: LONG_MEETING_ID });
      const summary = await backend.call('getSummary', { meetingId: LONG_MEETING_ID });
      expect(summary.state).toBe('outdated');
    });
  });

  it('reports playback moving, keeps the position on pause and then stays still', async () => {
    const positions: number[] = [];
    backend.on('playbackPosition', ({ positionMs }) => positions.push(positionMs));
    await backend.call('seekAudio', { meetingId: LONG_MEETING_ID, positionMs: 1000 });
    vi.advanceTimersByTime(500);
    await backend.call('pauseAudio', { meetingId: LONG_MEETING_ID });
    vi.advanceTimersByTime(1000);
    expect(positions).toEqual([1000, 1250, 1500, 1500]);
  });

  it('plays a meeting that is still recording', async () => {
    const { meetingId } = await backend.call('startRecording', {});
    vi.advanceTimersByTime(3000);
    const first = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
    const positionMs = first.segments[0]?.startMs as number;
    const positions: number[] = [];
    backend.on('playbackPosition', (event) => positions.push(event.positionMs));
    await backend.call('seekAudio', { meetingId, positionMs });
    vi.advanceTimersByTime(250);
    expect(positions).toEqual([positionMs, positionMs + 250]);
  });

  describe('across screens', () => {
    const edit = async (meetingId: string) => {
      const { segments } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 5 });
      const segment = segments[0] as TranscriptSegment;
      const wordId = segment.words[0]?.id as string;
      return { segment, range: { firstWordId: wordId, lastWordId: wordId } };
    };

    it('keeps a live correction through the final pass and in search', async () => {
      const { meetingId } = await backend.call('startRecording', {});
      vi.advanceTimersByTime(3000);
      const { range } = await edit(meetingId);
      await backend.call('applyCorrection', {
        meetingId,
        range,
        text: 'Halden',
        remember: false,
      });
      await backend.call('stopRecording');
      backend.finishFinalPass();

      const { segments } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 10 });
      const words = segments.flatMap((segment) => segment.words);
      expect(words[0]).toMatchObject({ text: 'Halden', state: 'corrected' });
      expect(words.filter((word) => word.state === 'corrected')).toHaveLength(1);
      expect(words.some((word) => word.state === 'provisional')).toBe(false);
      const results = await backend.call('searchMeetings', { query: 'halden' });
      expect(results.map((result) => result.meeting.id)).toContain(meetingId);

      await backend.call('undo', { meetingId });
      const undone = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
      expect(undone.segments[0]?.words[0]?.state).toBe('final');
    });

    it('never reuses a sample id for a remembered term or a split speaker', async () => {
      const meetingId = LONG_MEETING_ID;
      for (let round = 0; round < 6; round += 1) {
        const { range } = await edit(meetingId);
        await backend.call('applyCorrection', {
          meetingId,
          range,
          text: `Term ${round}`,
          remember: true,
        });
        await backend.call('splitSpeaker', { meetingId, range, newLabel: `Guest ${round}` });
      }
      const termIds = (await backend.call('listTerms')).map((term) => term.id);
      const { speakers } = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
      const speakerIds = speakers.map((speaker) => speaker.id);
      expect(new Set(termIds).size).toBe(termIds.length);
      expect(new Set(speakerIds).size).toBe(speakerIds.length);
    });

    it('marks a summary outdated after a transcript edit, and after undo', async () => {
      const meetingId = LONG_MEETING_ID;
      const seen: string[] = [];
      backend.on('summaryOutdated', (event) => seen.push(event.meetingId));
      const { range } = await edit(meetingId);
      await backend.call('applyCorrection', { meetingId, range, text: 'New', remember: false });
      expect(seen).toEqual([meetingId]);
      expect((await backend.call('getSummary', { meetingId })).state).toBe('outdated');
      expect((await backend.call('getMeeting', { meetingId })).summaryState).toBe('outdated');

      await backend.call('generateSummary', { meetingId, length: 'brief' });
      vi.advanceTimersByTime(5000);
      await backend.call('undo', { meetingId });
      expect((await backend.call('getSummary', { meetingId })).state).toBe('outdated');
    });

    it('leaves a meeting with no summary alone', async () => {
      const seen: string[] = [];
      backend.on('summaryOutdated', (event) => seen.push(event.meetingId));
      const meetingId = 'meeting-imported';
      const { range } = await edit(meetingId);
      await backend.call('applyCorrection', { meetingId, range, text: 'New', remember: false });
      expect(seen).toEqual([]);
    });

    it('marks a summary outdated when a speaker changes in the Speakers screen', async () => {
      const meetingId = LONG_MEETING_ID;
      await backend.call('renameSpeaker', {
        target: { kind: 'meetingSpeaker', meetingId, speakerId: 'sp-2' },
        name: 'Ana',
      });
      expect((await backend.call('getSummary', { meetingId })).state).toBe('outdated');
    });

    it('updates the library speaker count on merge and split', async () => {
      const meetingId = LONG_MEETING_ID;
      const count = async () => (await backend.call('getMeeting', { meetingId })).speakerCount;
      const before = await count();
      await backend.call('mergeSpeakers', {
        kind: 'meetingSpeakers',
        meetingId,
        from: 'sp-2',
        into: 'sp-3',
      });
      expect(await count()).toBe(before - 1);
      const { range } = await edit(meetingId);
      await backend.call('splitSpeaker', { meetingId, range, newLabel: 'Guest' });
      expect(await count()).toBe(before);
    });

    it('undoes an earlier reassignment onto a speaker that still exists after a merge', async () => {
      const meetingId = LONG_MEETING_ID;
      const { segment, range } = await edit(meetingId);
      const [other, target] = MOCK_SPEAKERS.map((speaker) => speaker.id).filter(
        (id) => id !== segment.speakerId,
      ) as [string, string];
      await backend.call('reassignSpeaker', { meetingId, range, speakerId: other });
      await backend.call('mergeSpeakers', {
        kind: 'meetingSpeakers',
        meetingId,
        from: segment.speakerId,
        into: target,
      });
      await backend.call('undo', { meetingId });
      const page = await backend.call('getTranscript', { meetingId, offset: 0, limit: 3 });
      const known = new Set(page.speakers.map((speaker) => speaker.id));
      expect(page.segments.every((item) => known.has(item.speakerId))).toBe(true);
    });

    it('sends segments moved between speakers in place, for both transcript views', async () => {
      const meetingId = LONG_MEETING_ID;
      const changes: TranscriptChanged['change'][] = [];
      backend.on('transcriptChanged', ({ change }) => changes.push(change));
      await backend.call('mergeSpeakers', {
        kind: 'meetingSpeakers',
        meetingId,
        from: 'sp-2',
        into: 'sp-3',
      });
      expect(changes[0]).toMatchObject({ kind: 'replace', removedSegmentIds: [] });
    });

    it('stops live playback when the recording stops, and leaves other playback running', async () => {
      const { meetingId } = await backend.call('startRecording', {});
      vi.advanceTimersByTime(3000);
      const events: { id: string; playing: boolean }[] = [];
      backend.on('playbackPosition', (event) =>
        events.push({ id: event.meetingId, playing: event.isPlaying }),
      );
      await backend.call('seekAudio', { meetingId, positionMs: 0 });
      await backend.call('stopRecording');
      expect(events.at(-1)).toEqual({ id: meetingId, playing: false });

      await backend.call('startRecording', {});
      await backend.call('seekAudio', { meetingId: LONG_MEETING_ID, positionMs: 0 });
      await backend.call('stopRecording');
      events.length = 0;
      vi.advanceTimersByTime(250);
      expect(events).toEqual([{ id: LONG_MEETING_ID, playing: true }]);
    });

    it('survives a library change while audio is playing', async () => {
      await backend.call('seekAudio', { meetingId: LONG_MEETING_ID, positionMs: 0 });
      backend.setLibrary([]);
      expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    });

    it('restores original transcripts when the sample library is restored', async () => {
      const meetingId = LONG_MEETING_ID;
      const { segment, range } = await edit(meetingId);
      await backend.call('applyCorrection', { meetingId, range, text: 'New', remember: false });
      backend.reset();
      expect((await edit(meetingId)).segment).toEqual(segment);
      expect(await backend.call('undo', { meetingId })).toEqual({ canUndo: false, canRedo: false });
    });
  });

  it('ends the mic test when a recording starts, and refuses one during a recording', async () => {
    const ended: unknown[] = [];
    backend.on('audioCheck', ({ endReason }) => endReason && ended.push(endReason));
    const sources = { micDeviceId: null, meetingAppId: 'app-teams' };
    await backend.call('startAudioCheck', { sources });
    await backend.call('startRecording', {});
    expect(ended).toEqual(['recordingStarted']);
    await expect(backend.call('startAudioCheck', { sources })).rejects.toThrow(ContractError);
  });

  it('records why a recording is paused', async () => {
    await backend.call('startRecording', {});
    await backend.call('pauseRecording');
    expect((await backend.call('getRecordingSnapshot')).state.pauseReason).toBe('user');
    await backend.call('resumeRecording');
    expect((await backend.call('getRecordingSnapshot')).state.pauseReason).toBeNull();
  });

  it('runs every developer trigger without throwing', () => {
    for (const trigger of DEV_TRIGGERS) expect(() => trigger.run(backend)).not.toThrow();
  });
});
