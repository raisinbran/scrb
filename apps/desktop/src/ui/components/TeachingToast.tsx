import { useEffect } from 'react';
import { closeTeaching, useTeachingOpen } from '../lib/notification-prefs.ts';
import { PopupBanner } from './PopupBanner.tsx';
import styles from './PrivacyBanner.module.css';

const AUTO_HIDE_MS = 8000;

/** Shown once, after the first optional banner is dismissed. It floats with the app notices, so nothing moves. */
export function TeachingToast({ onOpenSettings }: { onOpenSettings(): void }) {
  const open = useTeachingOpen();
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(closeTeaching, AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [open]);
  if (!open) return null;
  return (
    <PopupBanner dismissLabel="Close" onDismiss={closeTeaching}>
      <p>You can turn banners on or off in Settings &gt; Notifications.</p>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => {
          closeTeaching();
          onOpenSettings();
        }}
      >
        Open settings
      </button>
    </PopupBanner>
  );
}
