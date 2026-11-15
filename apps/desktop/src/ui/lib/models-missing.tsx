import { createContext, useContext, useEffect } from 'react';
import type { Backend } from '@scrb/contracts';
import { useBackend } from './backend-context.tsx';
import { useBackendData } from './use-backend-data.ts';

const load = (backend: Backend) => backend.call('getSetupStatus');

export interface ModelsNeeded {
  /** True when a required model file is not installed. The optional summary model never counts. */
  missing: boolean;
  /** Bytes still to download. */
  bytes: number;
  /** `loading` and `failed` mean model availability is unknown, so recording must wait. */
  setup: 'loading' | 'failed' | 'ready';
  /** Models became installed after this process started; the main process only sees them after a restart. */
  restartNeeded: boolean;
  /** Why Start must stay disabled, or null when models allow recording. */
  startBlockedReason: string | null;
}

// The main process checks models once at startup, so a download finished in this process does not
// let it record until the app restarts. Kept per process, never persisted.
const seen = { missing: false };
/** Test hook: forget what this process saw. */
export function resetModelsRestartState(): void {
  seen.missing = false;
}

/** Whether Scribe still needs to download models before it can record. */
export function useModelsNeeded(): ModelsNeeded {
  const backend = useBackend();
  const { state, reload } = useBackendData(load);
  useEffect(
    () =>
      backend.on('modelDownloadProgress', (event) => {
        if (event.state === 'done') reload();
      }),
    [backend, reload],
  );
  const missingNow =
    state.status === 'ready' &&
    state.data.models.some((model) => model.role !== 'summary' && !model.installed);
  useEffect(() => {
    if (missingNow) seen.missing = true;
  }, [missingNow]);
  if (state.status !== 'ready') {
    const setup = state.status;
    const startBlockedReason =
      setup === 'loading'
        ? 'Checking that Scribe is set up'
        : 'Scribe could not check its setup. Restart Scribe to try again';
    return { missing: false, bytes: 0, setup, restartNeeded: false, startBlockedReason };
  }
  const absent = state.data.models.filter((model) => model.role !== 'summary' && !model.installed);
  const missing = absent.length > 0;
  const restartNeeded = !missing && seen.missing;
  const startBlockedReason = missing
    ? 'Download the speech models first'
    : restartNeeded
      ? 'Restarting to finish setup'
      : null;
  return {
    missing,
    bytes: absent.reduce((sum, m) => sum + m.sizeBytes, 0),
    setup: 'ready',
    restartNeeded,
    startBlockedReason,
  };
}

const OpenModelsContext = createContext<() => void>(() => undefined);
export const OpenModelsProvider = OpenModelsContext.Provider;

/** Opens Settings at the Models section, where the download starts. */
export function useOpenModels(): () => void {
  return useContext(OpenModelsContext);
}

/** Set by the link that opens Settings; the Models section scrolls to itself once and clears it. */
export const FOCUS_MODELS_KEY = 'scrb.focus-models';

/** Fired with the key so a Models section that is already on screen scrolls too; one not yet mounted reads the key. */
export const FOCUS_MODELS_EVENT = 'scrb:focus-models';
