import { useCallback, useRef, useState } from 'react';

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

/** Tracks one user action: busy while it runs, and its failure text for an alert. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, error, run };
}
