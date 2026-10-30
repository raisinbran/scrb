import { useCallback, useEffect, useState } from 'react';
import type { Backend } from '@scrb/contracts';
import { useBackend } from './backend-context.tsx';

export type BackendData<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; message: string };

/** Loads once on mount and on `reload`. `load` must be stable (module-level or memoized). */
export function useBackendData<T>(load: (backend: Backend) => Promise<T>) {
  const backend = useBackend();
  const [state, setState] = useState<BackendData<T>>({ status: 'loading' });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    load(backend).then(
      (data) => current && setState({ status: 'ready', data }),
      (error: unknown) =>
        current &&
        setState({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Something went wrong.',
        }),
    );
    return () => {
      current = false;
    };
  }, [backend, load, generation]);

  const reload = useCallback(() => setGeneration((value) => value + 1), []);
  return { state, reload };
}
