import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError, CALL_NAMES } from '@scrb/contracts';
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
    backend.on('transcriptChanged', () => (appended += 1));
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
    const { elapsedMs } = await backend.call('getRecordingState');
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

  it('runs every developer trigger without throwing', () => {
    for (const trigger of DEV_TRIGGERS) expect(() => trigger.run(backend)).not.toThrow();
  });
});
