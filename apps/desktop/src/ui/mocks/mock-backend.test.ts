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

  it('reports playback moving until it is stopped', async () => {
    const positions: number[] = [];
    backend.on('playbackPosition', ({ positionMs, isPlaying }) => {
      if (isPlaying) positions.push(positionMs);
    });
    await backend.call('seekAudio', { meetingId: LONG_MEETING_ID, positionMs: 1000 });
    vi.advanceTimersByTime(1000);
    await backend.call('pauseAudio', { meetingId: LONG_MEETING_ID });
    vi.advanceTimersByTime(1000);
    expect(positions).toEqual([1000, 1500, 2000]);
  });

  it('runs every developer trigger without throwing', () => {
    for (const trigger of DEV_TRIGGERS) expect(() => trigger.run(backend)).not.toThrow();
  });
});
