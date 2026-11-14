import { createContext, useContext, type ReactNode } from 'react';
import { ContractError, type Backend } from '@scrb/contracts';

const MockModeContext = createContext(false);

const SetupBlockedContext = createContext<string | null>(null);

export function MockModeProvider({
  mock,
  blocked = null,
  children,
}: {
  mock: boolean;
  /** Why a packaged app cannot record yet (missing tools or models), or null. */
  blocked?: string | null;
  children: ReactNode;
}) {
  return (
    <MockModeContext.Provider value={mock && !blocked}>
      <SetupBlockedContext.Provider value={blocked}>{children}</SetupBlockedContext.Provider>
    </MockModeContext.Provider>
  );
}

/** The packaged app's "cannot record yet" message, or null when recording is set up. */
export function useSetupBlocked(): string | null {
  return useContext(SetupBlockedContext);
}

/** True when part of the app is simulated: recording or the final pass is not set up. */
export function useMockMode(): boolean {
  return useContext(MockModeContext);
}

async function isUnsupported(real: Backend, probe: () => Promise<unknown>): Promise<boolean> {
  try {
    await probe();
    return false;
  } catch (error) {
    return error instanceof ContractError && error.code === 'notImplemented';
  }
}

/**
 * The main process registers recording handlers only with a capture helper, and import handlers
 * only with a final-pass config; a missing handler answers `notImplemented` and the hybrid
 * backend falls back to the mock. The import probe names an import that cannot exist, so a
 * real handler answers `notFound` and changes nothing. Live text has no such signal in the
 * contract, so a missing live config is not detected here.
 */
export async function detectMockMode(real: Backend): Promise<boolean> {
  const unsupported = await Promise.all([
    isUnsupported(real, () => real.call('getRecordingSnapshot')),
    isUnsupported(real, () => real.call('cancelImport', { importId: 'mock-mode-probe' })),
  ]);
  return unsupported.some(Boolean);
}

/**
 * A packaged app with missing tools or models answers the recording snapshot with a `conflict`
 * carrying its message (a set-up recording never does), so the UI shows that state, not the mock.
 */
export async function detectSetupBlocked(real: Backend): Promise<string | null> {
  try {
    await real.call('getRecordingSnapshot');
    return null;
  } catch (error) {
    return error instanceof ContractError && error.code === 'conflict' ? error.message : null;
  }
}
