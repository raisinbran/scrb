import {
  ContractError,
  type AppSettings,
  type Backend,
  type CallName,
  type EventName,
} from '@scrb/contracts';

const SETTINGS_CALLS: ReadonlySet<CallName> = new Set(['getSettings', 'updateSettings']);
const REAL_CALLS: ReadonlySet<CallName> = new Set([
  ...SETTINGS_CALLS,
  'startRecording',
  'pauseRecording',
  'resumeRecording',
  'stopRecording',
  'getRecordingSnapshot',
]);
const REAL_EVENTS: ReadonlySet<EventName> = new Set([
  'recordingStateChanged',
  'recordingHealth',
  'levelMeter',
]);

/**
 * Real settings and, when a capture helper is set up, real recording, with everything else on the mock, until each phase connects its screens. The mock
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

  return {
    call: (async (name: CallName, request?: unknown) => {
      const callMock = mock.call as (name: CallName, request?: unknown) => Promise<unknown>;
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
