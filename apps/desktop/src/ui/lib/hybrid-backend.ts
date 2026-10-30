import {
  ContractError,
  type AppSettings,
  type Backend,
  type CallName,
  type ContractErrorCode,
  type EventName,
  type MeetingId,
  type MeetingListItem,
} from '@scrb/contracts';

const NOT_REAL: ReadonlySet<ContractErrorCode> = new Set(['notFound', 'notImplemented']);

const SETTINGS_CALLS: ReadonlySet<CallName> = new Set(['getSettings', 'updateSettings']);
const REAL_CALLS: ReadonlySet<CallName> = new Set([
  ...SETTINGS_CALLS,
  'startRecording',
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
  'getRecordingSnapshot',
  'listInputDevices',
  'listMeetingApps',
  'selectSources',
]);
/** Each goes to the side that holds the meeting it names. */
const MEETING_CALLS: ReadonlySet<CallName> = new Set([
  'getMeeting',
  'getTranscript',
  'getSummary',
  'deleteMeeting',
]);
const REAL_EVENTS: ReadonlySet<EventName> = new Set([
  'recordingStateChanged',
  'recordingHealth',
  'levelMeter',
]);

/**
 * Real settings, real meetings and, when a capture helper is set up, real recording, with everything else on the mock, until each phase connects its screens. The mock
 * gets a copy of the settings because its privacy banner rule reads them.
 */
export function createHybridBackend(real: Backend, mock: Backend): Backend {
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

  const listRealMeetings = async (request: unknown): Promise<MeetingListItem[]> => {
    try {
      return (await callReal('listMeetings', request)) as MeetingListItem[];
    } catch (error) {
      if (error instanceof ContractError && error.code === 'notImplemented') return [];
      throw error;
    }
  };

  return {
    call: (async (name: CallName, request?: unknown) => {
      const callMock = mock.call as (name: CallName, request?: unknown) => Promise<unknown>;
      if (name === 'listMeetings') {
        const meetings = await listRealMeetings(request);
        await synced;
        return [...meetings, ...((await callMock(name, request)) as MeetingListItem[])];
      }
      if (MEETING_CALLS.has(name)) {
        const { meetingId } = request as { meetingId: MeetingId };
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
