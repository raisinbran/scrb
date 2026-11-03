import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError, type Backend } from '@scrb/contracts';
import { createHybridBackend } from './hybrid-backend.ts';
import { MockBackend } from '../mocks/index.ts';

describe('createHybridBackend', () => {
  let mock: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    mock = new MockBackend();
  });

  const realReturning = async () => {
    const settings = {
      ...(await mock.call('getSettings')),
      theme: 'dark' as const,
      location: { country: 'US', usState: 'IL' },
    };
    return { call: vi.fn(async () => settings), on: vi.fn() } as unknown as Backend;
  };

  it('sends settings to the real backend and copies them to the mock', async () => {
    const real = await realReturning();
    const backend = createHybridBackend(real, mock);
    expect((await backend.call('getSettings')).theme).toBe('dark');
    expect((await mock.call('getSettings')).location.usState).toBe('IL');
  });

  it('leaves other calls on the mock', async () => {
    const real = await realReturning();
    await createHybridBackend(real, mock).call('listTerms');
    expect(real.call).not.toHaveBeenCalledWith('listTerms', undefined);
  });

  it('sends the source pickers to the real backend without copying them to the mock', async () => {
    const devices = [{ id: 'uid', name: 'Mic', isSystemDefault: true, transport: 'usb' }];
    const real = {
      call: vi.fn(async (name: string) => (name === 'listInputDevices' ? devices : undefined)),
      on: vi.fn(),
    } as unknown as Backend;
    const backend = createHybridBackend(real, mock);
    expect(await backend.call('listInputDevices')).toEqual(devices);
    await backend.call('listMeetingApps');
    const selection = { micDeviceId: 'uid', meetingAppId: 'com.example.app' };
    await backend.call('selectSources', selection);
    expect(real.call).toHaveBeenCalledWith('listMeetingApps', undefined);
    expect(real.call).toHaveBeenCalledWith('selectSources', selection);
    expect((await mock.call('getSettings')).audio.meetingAppId).toBe('app-teams');
  });

  it('brings the mock up to date before any other call', async () => {
    const real = await realReturning();
    const status = await createHybridBackend(real, mock).call('getSetupStatus');
    expect(status.locationSet).toBe(true);
    expect((await mock.call('getSettings')).location.usState).toBe('IL');
  });

  it('falls back to the mock when the library did not open', async () => {
    const failure = new ContractError({ code: 'notImplemented', message: 'No.' });
    const real = {
      call: vi.fn(async () => {
        throw failure;
      }),
      on: vi.fn(),
    } as unknown as Backend;
    const settings = await createHybridBackend(real, mock).call('updateSettings', {
      theme: 'dark',
    });
    expect(settings.theme).toBe('dark');
  });

  describe('meetings', () => {
    const REAL_ID = 'real-meeting';
    const item = {
      id: REAL_ID,
      title: 'Real',
      startedAt: '2020-01-01T00:00:00.000Z',
      durationMs: 1000,
      origin: 'recorded',
      status: 'ready',
      summaryState: 'notGenerated',
      speakerCount: 0,
    };
    const summary = { meetingId: REAL_ID, state: 'notGenerated' };
    const transcript = { meetingId: REAL_ID, segments: [] };
    const deleteFailure = new ContractError({ code: 'notImplemented', message: 'Not yet.' });

    /** A library holding one real meeting. */
    const realWithMeeting = () =>
      ({
        call: vi.fn(async (name: string, request?: { meetingId?: string }) => {
          if (name === 'listMeetings') return [item];
          if (name === 'getSettings') return mock.call('getSettings');
          if (request?.meetingId !== REAL_ID) {
            throw new ContractError({ code: 'notFound', message: 'Gone.' });
          }
          if (name === 'getMeeting') return { ...item, gaps: [] };
          if (name === 'getTranscript') return transcript;
          if (name === 'getSummary') return summary;
          throw deleteFailure;
        }),
        on: vi.fn(),
      }) as unknown as Backend;

    it('lists real meetings before the samples, even when a sample is newer', async () => {
      const samples = await mock.call('listMeetings', {});
      const listed = await createHybridBackend(realWithMeeting(), mock).call('listMeetings', {});
      expect(listed.map(({ id }) => id)).toEqual([REAL_ID, ...samples.map(({ id }) => id)]);
    });

    it('passes the filter to both sides', async () => {
      const real = realWithMeeting();
      const filter = { origin: 'imported' as const };
      const listed = await createHybridBackend(real, mock).call('listMeetings', { filter });
      expect(real.call).toHaveBeenCalledWith('listMeetings', { filter });
      expect(listed.slice(1).every(({ origin }) => origin === 'imported')).toBe(true);
    });

    it('answers for a real meeting from the real backend', async () => {
      const backend = createHybridBackend(realWithMeeting(), mock);
      const page = { meetingId: REAL_ID, offset: 0, limit: 10 };
      expect((await backend.call('getMeeting', { meetingId: REAL_ID })).title).toBe('Real');
      expect(await backend.call('getTranscript', page)).toEqual(transcript);
      expect(await backend.call('getSummary', { meetingId: REAL_ID })).toEqual(summary);
    });

    it('sends playback of a real meeting to the real clock and its events back', async () => {
      const real = realWithMeeting();
      const backend = createHybridBackend(real, mock);
      backend.on('playbackPosition', vi.fn());
      expect(real.on).toHaveBeenCalledWith('playbackPosition', expect.any(Function));
      const request = { meetingId: REAL_ID, positionMs: 0 };
      await backend.call('seekAudio', request).catch(() => undefined);
      await backend.call('getPlaybackMedia', request).catch(() => undefined);
      await backend.call('pauseAudio', { meetingId: REAL_ID }).catch(() => undefined);
      expect(real.call).toHaveBeenCalledWith('seekAudio', request);
      expect(real.call).toHaveBeenCalledWith('getPlaybackMedia', request);
      expect(real.call).toHaveBeenCalledWith('pauseAudio', { meetingId: REAL_ID });
    });

    it('routes edits and other meeting actions to their owning backend', async () => {
      const real = realWithMeeting();
      const backend = createHybridBackend(real, mock);
      const range = { firstWordId: 'word-1', lastWordId: 'word-2' };
      const requests = [
        ['getUndoState', { meetingId: REAL_ID }],
        ['applyCorrection', { meetingId: REAL_ID, range, text: 'edit', remember: false }],
        ['reassignSpeaker', { meetingId: REAL_ID, range, speakerId: 'speaker-1' }],
        ['undo', { meetingId: REAL_ID }],
        ['redo', { meetingId: REAL_ID }],
        ['splitSpeaker', { meetingId: REAL_ID, range, newLabel: 'New speaker' }],
        ['answerSpeakerSuggestion', {
          meetingId: REAL_ID, speakerId: 'speaker-1', profileId: 'profile-1', accepted: true,
        }],
        ['listSpeakerSuggestions', { meetingId: REAL_ID }],
        ['updateMeeting', { meetingId: REAL_ID, title: 'Updated' }],
        ['retryFinalPass', { meetingId: REAL_ID }],
        ['generateSummary', { meetingId: REAL_ID, length: 'brief' }],
        ['updateSummaryItem', { meetingId: REAL_ID, update: {} }],
        ['openMeetingFolder', { meetingId: REAL_ID, folder: 'meeting' }],
      ] as const;
      for (const [name, request] of requests) {
        await backend.call(name, request as never).catch(() => undefined);
        expect(real.call).toHaveBeenCalledWith(name, request);
      }
      const rename = {
        target: { kind: 'meetingSpeaker' as const, meetingId: REAL_ID, speakerId: 'speaker-1' },
        name: 'Named',
      };
      const merge = { kind: 'meetingSpeakers' as const, meetingId: REAL_ID, from: 'a', into: 'b' };
      await backend.call('renameSpeaker', rename).catch(() => undefined);
      await backend.call('mergeSpeakers', merge).catch(() => undefined);
      expect(real.call).toHaveBeenCalledWith('renameSpeaker', rename);
      expect(real.call).toHaveBeenCalledWith('mergeSpeakers', merge);
    });

    it('keeps profile-only calls and sample meeting edits on the mock', async () => {
      const real = realWithMeeting();
      const backend = createHybridBackend(real, mock);
      const [sample] = await mock.call('listMeetings', {});
      const meetingId = sample?.id ?? '';
      await backend.call('getUndoState', { meetingId });
      await backend.call('listSpeakerSuggestions', {});
      await backend.call('renameSpeaker', {
        target: { kind: 'profile', profileId: 'profile-1' },
        name: 'New',
      }).catch(() => undefined);
      await backend.call('mergeSpeakers', {
        kind: 'profiles', from: 'profile-1', into: 'profile-2',
      }).catch(() => undefined);
      expect(real.call).not.toHaveBeenCalledWith('getUndoState', { meetingId });
      expect(real.call).not.toHaveBeenCalledWith('listSpeakerSuggestions', {});
      expect(real.call).not.toHaveBeenCalledWith('renameSpeaker', expect.anything());
      expect(real.call).not.toHaveBeenCalledWith('mergeSpeakers', expect.anything());
    });

    it('forwards live pause, summary and meeting change events from real backend', () => {
      const real = realWithMeeting();
      const backend = createHybridBackend(real, mock);
      for (const name of ['pauseSpansChanged', 'summaryOutdated', 'meetingChanged'] as const) {
        const listener = vi.fn();
        const unsubscribe = backend.on(name, listener as never);
        expect(real.on).toHaveBeenCalledWith(name, listener);
        expect(mock).toBeDefined();
        unsubscribe();
      }
    });

    it('answers for a sample from the mock', async () => {
      const backend = createHybridBackend(realWithMeeting(), mock);
      const [sample] = await mock.call('listMeetings', {});
      const meetingId = sample?.id ?? '';
      expect((await backend.call('getMeeting', { meetingId })).id).toBe(meetingId);
      expect((await backend.call('getSummary', { meetingId })).meetingId).toBe(meetingId);
      const page = await backend.call('getTranscript', { meetingId, offset: 0, limit: 1 });
      expect(page.meetingId).toBe(meetingId);
    });

    it('shows a real meeting its delete failure instead of trying the mock', async () => {
      const backend = createHybridBackend(realWithMeeting(), mock);
      await expect(backend.call('deleteMeeting', { meetingId: REAL_ID })).rejects.toBe(
        deleteFailure,
      );
    });

    it('still deletes a sample on the mock', async () => {
      const backend = createHybridBackend(realWithMeeting(), mock);
      const [sample] = await mock.call('listMeetings', {});
      const result = await backend.call('deleteMeeting', { meetingId: sample?.id ?? '' });
      expect(result.verified).toBe(true);
    });

    it('keeps the samples working when the library did not open', async () => {
      const failing = {
        call: vi.fn(async () => {
          throw new ContractError({ code: 'notImplemented', message: 'No.' });
        }),
        on: vi.fn(),
      } as unknown as Backend;
      const backend = createHybridBackend(failing, mock);
      const samples = await mock.call('listMeetings', {});
      expect(await backend.call('listMeetings', {})).toEqual(samples);
      const meetingId = samples[0]?.id ?? '';
      expect((await backend.call('getMeeting', { meetingId })).id).toBe(meetingId);
      expect((await backend.call('deleteMeeting', { meetingId })).verified).toBe(true);
    });

    it('does not hide a failure reading a real meeting', async () => {
      const broken = {
        call: vi.fn(async (name: string) => {
          if (name === 'getMeeting') {
            throw new ContractError({ code: 'internal', message: 'Something went wrong.' });
          }
          return mock.call('getSettings');
        }),
        on: vi.fn(),
      } as unknown as Backend;
      await expect(
        createHybridBackend(broken, mock).call('getSummary', { meetingId: REAL_ID }),
      ).rejects.toThrow('Something went wrong.');
    });
  });

  it('sends imports and their events to the real backend', async () => {
    const real = await realReturning();
    const backend = createHybridBackend(real, mock);
    await backend.call('pickAudioFile');
    expect(real.call).toHaveBeenCalledWith('pickAudioFile', undefined);
    const request = { fileToken: 'token', buildVoiceProfiles: false };
    await backend.call('importAudioFile', request);
    expect(real.call).toHaveBeenCalledWith('importAudioFile', request);
    backend.on('importFinished', () => undefined);
    expect(real.on).toHaveBeenCalledWith('importFinished', expect.any(Function));
  });

  it('passes a real failure on to the caller', async () => {
    const real = {
      call: vi.fn(async () => {
        throw new ContractError({ code: 'diskFull', message: 'Disk full.' });
      }),
      on: vi.fn(),
    } as unknown as Backend;
    await expect(createHybridBackend(real, mock).call('getSettings')).rejects.toThrow('Disk full.');
  });
});
