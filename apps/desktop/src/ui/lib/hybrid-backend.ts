import {
  ContractError,
  type AppSettings,
  type Backend,
  type CallName,
  type ContractErrorCode,
  type EventName,
  type MeetingId,
  type MeetingListItem,
  type SearchResult,
} from '@scrb/contracts';

const NOT_REAL: ReadonlySet<ContractErrorCode> = new Set(['notFound', 'notImplemented']);

const SETTINGS_CALLS: ReadonlySet<CallName> = new Set(['getSettings', 'updateSettings']);
const REAL_CALLS: ReadonlySet<CallName> = new Set([
  ...SETTINGS_CALLS,
  'getSetupStatus',
  'startRecording',
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
  'getRecordingSnapshot',
  'showMiniWindow',
  'listInputDevices',
  'listMeetingApps',
  'selectSources',
  'pickAudioFile',
  'importAudioFile',
  'cancelImport',
  'listImports',
  'listTerms',
  'listVocabularySuggestions',
  'answerVocabularySuggestion',
  'updateTerm',
  'deleteTerm',
  'getVocabularyUndoState',
  'undoVocabulary',
  'redoVocabulary',
  // Together, so a profile id never reaches a side that did not make it. The meeting variants of
  // the two speaker calls are routed by meeting first and never reach this set.
  'listProfiles',
  'getProfileUndoState',
  'undoProfileChange',
  'redoProfileChange',
  'deleteProfile',
  'renameSpeaker',
  'mergeSpeakers',
]);
/** Each goes to the side that holds the meeting it names. */
const MEETING_CALLS: ReadonlySet<CallName> = new Set([
  'getMeeting',
  'getTranscript',
  'getUndoState',
  'applyCorrection',
  'reassignSpeaker',
  'undo',
  'redo',
  'seekAudio',
  'pauseAudio',
  'getPlaybackMedia',
  'listSpeakerSuggestions',
  'splitSpeaker',
  'answerSpeakerSuggestion',
  'getSummary',
  'generateSummary',
  'cancelSummary',
  'updateSummaryItem',
  'updateMeeting',
  'retryFinalPass',
  'openMeetingFolder',
  'exportMeeting',
  'deleteMeeting',
]);
const REAL_EVENTS: ReadonlySet<EventName> = new Set([
  'recordingStateChanged',
  'miniWindowHiddenChanged',
  'pauseSpansChanged',
  'recordingHealth',
  'levelMeter',
  'transcriptionLag',
  'transcriptChanged',
  'speakerSuggestion',
  'summaryProgress',
  'summaryOutdated',
  'meetingChanged',
  'exportFinished',
  'playbackPosition',
  'importProgress',
  'importFinished',
  'importFailed',
  'importCancelled',
  'finalPassProgress',
]);

/**
 * Real settings, real meetings and, when a capture helper is set up, real recording, with everything else on the mock, until each phase connects its screens. The mock
 * gets a copy of the settings because its privacy banner rule reads them.
 */
export function createHybridBackend(
  real: Backend,
  mock: Backend,
  /** A packaged app that cannot record yet: no sample meetings, and the idle snapshot stays. */
  options: { setupBlocked?: boolean } = {},
): Backend {
  const blocked = options.setupBlocked === true;
  const callReal = async (name: CallName, request: unknown): Promise<unknown> => {
    const call = real.call as (name: CallName, request?: unknown) => Promise<unknown>;
    const value = await call(name, request);
    if (SETTINGS_CALLS.has(name)) await mock.call('updateSettings', value as AppSettings);
    return value;
  };

  // The first-launch check reads the mock's copy, so nothing reaches the mock before it is current.
  const synced = callReal('getSettings', undefined).catch(() => undefined);

  /** `notImplemented` means the library did not open, so no meeting can be real. */
  const isRealMeeting = async (meetingId: MeetingId): Promise<boolean> => {
    try {
      await callReal('getMeeting', { meetingId });
      return true;
    } catch (error) {
      if (error instanceof ContractError && NOT_REAL.has(error.code)) return false;
      throw error;
    }
  };

  const meetingIdForCall = (name: CallName, request: unknown): MeetingId | undefined => {
    if (name === 'renameSpeaker') {
      const { target } = request as { target: { kind: string; meetingId?: MeetingId } };
      return target.kind === 'meetingSpeaker' ? target.meetingId : undefined;
    }
    if (name === 'mergeSpeakers') {
      const merge = request as { kind: string; meetingId?: MeetingId };
      return merge.kind === 'meetingSpeakers' ? merge.meetingId : undefined;
    }
    return MEETING_CALLS.has(name)
      ? (request as { meetingId?: MeetingId } | undefined)?.meetingId
      : undefined;
  };

  const listRealMeetings = async (request: unknown): Promise<MeetingListItem[]> => {
    try {
      return (await callReal('listMeetings', request)) as MeetingListItem[];
    } catch (error) {
      if (error instanceof ContractError && error.code === 'notImplemented') return [];
      throw error;
    }
  };

  const searchRealMeetings = async (request: unknown): Promise<SearchResult[]> => {
    try {
      return (await callReal('searchMeetings', request)) as SearchResult[];
    } catch (error) {
      if (error instanceof ContractError && error.code === 'notImplemented') return [];
      throw error;
    }
  };

  return {
    call: (async (name: CallName, request?: unknown) => {
      const callMock = mock.call as (name: CallName, request?: unknown) => Promise<unknown>;
      // Real meetings are searched on the real side, like the list, so a real meeting can be found.
      if (name === 'searchMeetings') {
        const found = await searchRealMeetings(request);
        await synced;
        return [...found, ...((await callMock(name, request)) as SearchResult[])];
      }
      if (name === 'listMeetings') {
        const meetings = await listRealMeetings(request);
        if (blocked) return meetings;
        await synced;
        return [...meetings, ...((await callMock(name, request)) as MeetingListItem[])];
      }
      const meetingId = meetingIdForCall(name, request);
      if (meetingId !== undefined) {
        // Outside the fallback below: a real meeting's own notImplemented must reach the user.
        if (await isRealMeeting(meetingId)) return await callReal(name, request);
        await synced;
        return callMock(name, request);
      }
      if (!REAL_CALLS.has(name)) {
        await synced;
        return callMock(name, request);
      }
      try {
        return await callReal(name, request);
      } catch (error) {
        // The library did not open; the main process has told the user.
        if (error instanceof ContractError && error.code === 'notImplemented') {
          return callMock(name, request);
        }
        // Blocked: the idle snapshot comes from the mock; recording itself stays refused.
        if (blocked && name === 'getRecordingSnapshot') return callMock(name, request);
        throw error;
      }
    }) as Backend['call'],
    on: ((name: EventName, listener: never) => {
      const offMock = mock.on(name, listener);
      if (!REAL_EVENTS.has(name)) return offMock;
      const offReal = real.on(name, listener);
      return () => {
        offMock();
        offReal();
      };
    }) as Backend['on'],
  };
}
