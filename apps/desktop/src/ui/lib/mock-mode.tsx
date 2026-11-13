import { createContext, useContext, type ReactNode } from 'react';
import { ContractError, type Backend } from '@scrb/contracts';

const MockModeContext = createContext(false);

export function MockModeProvider({ mock, children }: { mock: boolean; children: ReactNode }) {
  return <MockModeContext.Provider value={mock}>{children}</MockModeContext.Provider>;
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
