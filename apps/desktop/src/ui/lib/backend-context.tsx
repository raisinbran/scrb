import { createContext, useContext, type ReactNode } from 'react';
import type { Backend } from '@scrb/contracts';

const BackendContext = createContext<Backend | null>(null);
const ProcessingBackendContext = createContext<Backend | null>(null);

export function BackendProvider({
  backend,
  processingBackend = backend,
  children,
}: {
  backend: Backend;
  /** Real, non-hybrid source for recording/final-pass status when demos are mixed into the UI. */
  processingBackend?: Backend;
  children: ReactNode;
}) {
  return (
    <BackendContext.Provider value={backend}>
      <ProcessingBackendContext.Provider value={processingBackend}>
        {children}
      </ProcessingBackendContext.Provider>
    </BackendContext.Provider>
  );
}

export function useBackend(): Backend {
  const backend = useContext(BackendContext);
  if (!backend) throw new Error('useBackend must be used inside BackendProvider');
  return backend;
}

/** Status observers must not count sample meetings injected by the hybrid backend. */
export function useProcessingBackend(): Backend {
  const backend = useContext(ProcessingBackendContext);
  if (!backend) throw new Error('useProcessingBackend must be used inside BackendProvider');
  return backend;
}
