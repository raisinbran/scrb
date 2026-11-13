import { createContext, useContext, type ReactNode } from 'react';
import { ContractError, type Backend } from '@scrb/contracts';

const MockModeContext = createContext(false);

export function MockModeProvider({ mock, children }: { mock: boolean; children: ReactNode }) {
  return <MockModeContext.Provider value={mock}>{children}</MockModeContext.Provider>;
}

/** True when meetings made in this window are fake: recording is not backed by the real helper. */
export function useMockMode(): boolean {
  return useContext(MockModeContext);
}

/**
 * Real recording exists only when the main process built a recording controller. Without one the
 * real side answers `notImplemented` for the recording calls, and the hybrid backend falls back
 * to the mock. Live text and the final pass have no such signal in the contract.
 */
export async function detectMockRecording(real: Backend): Promise<boolean> {
  try {
    await real.call('getRecordingSnapshot');
    return false;
  } catch (error) {
    return error instanceof ContractError && error.code === 'notImplemented';
  }
}
