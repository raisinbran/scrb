import { ContractError, type AppSettings, type Backend, type CallName } from '@scrb/contracts';

const REAL_CALLS: ReadonlySet<CallName> = new Set(['getSettings', 'updateSettings']);

/**
 * Real settings with everything else on the mock, until each phase connects its screens. The mock
 * gets a copy of the settings because its privacy banner rule reads them.
 */
export function createHybridBackend(real: Backend, mock: Backend): Backend {
  const callReal = async (name: CallName, request: unknown): Promise<AppSettings> => {
    const call = real.call as (name: CallName, request?: unknown) => Promise<AppSettings>;
    const settings = await call(name, request);
    await mock.call('updateSettings', settings);
    return settings;
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
    on: mock.on,
  };
}
