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
    await createHybridBackend(real, mock).call('checkModelUpdates');
    expect(real.call).not.toHaveBeenCalledWith('checkModelUpdates', undefined);
  });

  it('asks the real backend for setup status, and the mock when the library did not open', async () => {
    const real = {
      call: vi.fn(async (name: string) => {
        if (name === 'getSetupStatus') return { locationSet: true };
        throw new ContractError({ code: 'notImplemented', message: 'No library.' });
      }),
      on: vi.fn(),
    } as unknown as Backend;
    expect(await createHybridBackend(real, mock).call('getSetupStatus')).toEqual({
      locationSet: true,
    });
    const closed = {
      call: vi.fn(async () => {
        throw new ContractError({ code: 'notImplemented', message: 'No library.' });
      }),
      on: vi.fn(),
    } as unknown as Backend;
    expect(await createHybridBackend(closed, mock).call('getSetupStatus')).toEqual(
      await mock.call('getSetupStatus'),
    );
  });

  it('sends the vocabulary calls to the real backend, not the mock', async () => {
    const real = { call: vi.fn(async () => undefined), on: vi.fn() } as unknown as Backend;
    const mockCall = vi.spyOn(mock, 'call');
    const backend = createHybridBackend(real, mock);
    const requests: [string, unknown][] = [
      ['listTerms', undefined],
      ['listVocabularySuggestions', undefined],
      ['answerVocabularySuggestion', { id: 's1', accepted: true }],
      ['updateTerm', { id: 't1', patch: { enabled: false } }],
      ['deleteTerm', { id: 't1' }],
      ['getVocabularyUndoState', undefined],
      ['undoVocabulary', undefined],
      ['redoVocabulary', undefined],
    ];
    for (const [name, request] of requests) {
      await (backend.call as (n: string, r?: unknown) => Promise<unknown>)(name, request);
      expect(real.call).toHaveBeenCalledWith(name, request);
      expect(mockCall).not.toHaveBeenCalledWith(name, request);
    }
  });

  it('falls back to the mock for vocabulary when the library did not open', async () => {
    const real = {
      call: vi.fn(async (name: string) => {
        if (name === 'listTerms')
          throw new ContractError({ code: 'notImplemented', message: 'No.' });
        return undefined;
      }),
      on: vi.fn(),
    } as unknown as Backend;
    const terms = await createHybridBackend(real, mock).call('listTerms');
    expect(terms).toEqual(await mock.call('listTerms'));
    expect(terms.length).toBeGreaterThan(0);
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
    await createHybridBackend(real, mock).call('checkModelUpdates');
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

    it('routes real meeting operations without touching mock meetings', async () => {
      const answer = { owner: 'real' };
      const realFailure = new ContractError({ code: 'notImplemented', message: 'Not ready.' });
      const real = {
        call: vi.fn(
          async (
            name: string,
            request?: { meetingId?: string; target?: { meetingId?: string } },
          ) => {
            if (name === 'getSettings') return mock.call('getSettings');
            if (name === 'getMeeting') {
              if (request?.meetingId === REAL_ID) return { ...item, gaps: [] };
              throw new ContractError({ code: 'notFound', message: 'Not in real library.' });
            }
            if (name === 'renameSpeaker' && request?.target?.meetingId !== REAL_ID) {
              throw new Error('Expected a meeting-scoped rename');
            }
            if (name === 'mergeSpeakers' && request?.meetingId !== REAL_ID) {
              throw new Error('Expected a meeting-scoped merge');
            }
            if (name === 'undo') throw realFailure;
            return answer;
          },
        ),
        on: vi.fn(() => () => undefined),
      } as unknown as Backend;
      const mockCall = vi.spyOn(mock, 'call');
      const backend = createHybridBackend(real, mock);
      const range = { firstWordId: 'word-1', lastWordId: 'word-2' };
      const requests = [
        ['getUndoState', { meetingId: REAL_ID }],
        ['applyCorrection', { meetingId: REAL_ID, range, text: 'edit', remember: false }],
        ['reassignSpeaker', { meetingId: REAL_ID, range, speakerId: 'speaker-1' }],
        ['redo', { meetingId: REAL_ID }],
        ['splitSpeaker', { meetingId: REAL_ID, range, newLabel: 'New speaker' }],
        [
          'answerSpeakerSuggestion',
          {
            meetingId: REAL_ID,
            speakerId: 'speaker-1',
            profileId: 'profile-1',
            accepted: true,
          },
        ],
        ['listSpeakerSuggestions', { meetingId: REAL_ID }],
        ['updateMeeting', { meetingId: REAL_ID, title: 'Updated' }],
        ['retryFinalPass', { meetingId: REAL_ID }],
        ['generateSummary', { meetingId: REAL_ID, length: 'brief' }],
        ['updateSummaryItem', { meetingId: REAL_ID, update: {} }],
        ['openMeetingFolder', { meetingId: REAL_ID, folder: 'meeting' }],
        ['exportMeeting', { meetingId: REAL_ID }],
      ] as const;

      for (const [name, request] of requests) {
        expect(await backend.call(name, request as never)).toBe(answer);
        expect(real.call).toHaveBeenCalledWith(name, request);
        expect(mockCall).not.toHaveBeenCalledWith(name, request);
      }

      const rename = {
        target: { kind: 'meetingSpeaker' as const, meetingId: REAL_ID, speakerId: 'speaker-1' },
        name: 'Named',
      };
      const merge = { kind: 'meetingSpeakers' as const, meetingId: REAL_ID, from: 'a', into: 'b' };
      expect(await backend.call('renameSpeaker', rename)).toBe(answer);
      expect(await backend.call('mergeSpeakers', merge)).toBe(answer);
      expect(real.call).toHaveBeenCalledWith('renameSpeaker', rename);
      expect(real.call).toHaveBeenCalledWith('mergeSpeakers', merge);
      expect(mockCall).not.toHaveBeenCalledWith('renameSpeaker', rename);
      expect(mockCall).not.toHaveBeenCalledWith('mergeSpeakers', merge);

      await expect(backend.call('undo', { meetingId: REAL_ID })).rejects.toBe(realFailure);
      expect(mockCall).not.toHaveBeenCalledWith('undo', { meetingId: REAL_ID });
    });

    it('keeps sample meeting edits on the mock', async () => {
      const real = realWithMeeting();
      const backend = createHybridBackend(real, mock);
      const [sample] = await mock.call('listMeetings', {});
      const meetingId = sample?.id ?? '';
      await backend.call('getUndoState', { meetingId });
      await backend.call('listSpeakerSuggestions', {});
      expect(real.call).not.toHaveBeenCalledWith('getUndoState', { meetingId });
      expect(real.call).not.toHaveBeenCalledWith('listSpeakerSuggestions', {});
    });

    it('sends all voice-profile calls to the real backend, not the mock', async () => {
      const real = { call: vi.fn(async () => undefined), on: vi.fn() } as unknown as Backend;
      const mockCall = vi.spyOn(mock, 'call');
      const backend = createHybridBackend(real, mock);
      const requests: [string, unknown][] = [
        ['listProfiles', undefined],
        ['getProfileUndoState', undefined],
        ['undoProfileChange', undefined],
        ['redoProfileChange', undefined],
        ['deleteProfile', { profileId: 'profile-1' }],
        ['renameSpeaker', { target: { kind: 'profile', profileId: 'profile-1' }, name: 'New' }],
        ['mergeSpeakers', { kind: 'profiles', from: 'profile-1', into: 'profile-2' }],
      ];
      for (const [name, request] of requests) {
        await (backend.call as (n: string, r?: unknown) => Promise<unknown>)(name, request);
        expect(real.call).toHaveBeenCalledWith(name, request);
        expect(mockCall).not.toHaveBeenCalledWith(name, request);
      }
    });

    it('falls back to the mock for profiles when the library did not open', async () => {
      const real = {
        call: vi.fn(async () => {
          throw new ContractError({ code: 'notImplemented', message: 'No.' });
        }),
        on: vi.fn(),
      } as unknown as Backend;
      const profiles = await createHybridBackend(real, mock).call('listProfiles');
      expect(profiles).toEqual(await mock.call('listProfiles'));
    });

    it('forwards real meeting events and unsubscribes on both sides', () => {
      const listeners = new Map<string, (payload: never) => void>();
      const real = {
        call: vi.fn(),
        on: vi.fn((name: string, listener: (payload: never) => void) => {
          listeners.set(name, listener);
          return () => {
            listeners.delete(name);
          };
        }),
      } as unknown as Backend;
      const backend = createHybridBackend(real, mock);
      const events = [
        'pauseSpansChanged',
        'summaryOutdated',
        'meetingChanged',
        'speakerSuggestion',
        'summaryProgress',
        'exportFinished',
      ] as const;

      for (const name of events) {
        const observer = vi.fn();
        const off = backend.on(name, observer as never);
        expect(real.on).toHaveBeenCalledWith(name, observer);
        listeners.get(name)?.({ meetingId: REAL_ID } as never);
        expect(observer).toHaveBeenCalledTimes(1);
        off();
        expect(listeners.has(name)).toBe(false);
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

  it('refuses to record, and does not simulate it, when the real backend is missing its tools or models', async () => {
    const real = {
      call: vi.fn(async () => {
        throw new ContractError({ code: 'conflict', message: 'Scribe cannot record yet.' });
      }),
      on: vi.fn(),
    } as unknown as Backend;
    const mockCall = vi.spyOn(mock, 'call');
    await expect(createHybridBackend(real, mock).call('startRecording', {})).rejects.toMatchObject({
      code: 'conflict',
      message: 'Scribe cannot record yet.',
    });
    expect(mockCall).not.toHaveBeenCalledWith('startRecording', expect.anything());
  });
});
