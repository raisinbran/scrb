import { useEffect, useState } from 'react';
import { useBackend } from '../lib/backend-context.tsx';
import styles from './SharedLibraryNotice.module.css';

/** Acknowledgement is stored by the real backend in the current library's settings. */
export function SharedLibraryNotice() {
  const backend = useBackend();
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    backend
      .call('getSharedLibraryNotice')
      .then((value) => {
        if (current) setNotice(value);
      })
      .catch(() => {
        if (current) setNotice(null);
      });
    return () => {
      current = false;
    };
  }, [backend]);

  const dismiss = async () => {
    await backend.call('dismissSharedLibraryNotice');
    setNotice(null);
  };

  if (notice === null) return null;
  return (
    <div className={styles.notice} role="status">
      <span>{notice}</span>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss shared library permissions notice"
        onClick={() => void dismiss().catch(() => undefined)}
      >
        Dismiss
      </button>
    </div>
  );
}
