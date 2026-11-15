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
  if (state.status !== 'ready') return { missing: false, bytes: 0 };
  const absent = state.data.models.filter((model) => model.role !== 'summary' && !model.installed);
  return { missing: absent.length > 0, bytes: absent.reduce((sum, m) => sum + m.sizeBytes, 0) };
}

const OpenModelsContext = createContext<() => void>(() => undefined);
export const OpenModelsProvider = OpenModelsContext.Provider;

/** Opens Settings at the Models section, where the download starts. */
export function useOpenModels(): () => void {
  return useContext(OpenModelsContext);
}

/** Set by the link that opens Settings; the Models section scrolls to itself once and clears it. */
export const FOCUS_MODELS_KEY = 'scrb.focus-models';
