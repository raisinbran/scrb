import { createContext, useContext, useEffect } from 'react';
import { closeTeaching, registerTeachingHost, useTeachingOpen } from '../lib/notification-prefs.ts';
import { PopupBanner } from './PopupBanner.tsx';
import styles from './PrivacyBanner.module.css';

const AUTO_HIDE_MS = 8000;

/** How the pointer reaches Settings > Notifications; the app shell provides it. */
export const OpenNotificationSettings = createContext<() => void>(() => undefined);

/** Shown once, after the first optional banner is dismissed. Put it in the popup stack of the panel the person is in, so it looks and sits like every other banner. */
export function TeachingToast({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const open = useTeachingOpen();
  const openFromShell = useContext(OpenNotificationSettings);
  useEffect(registerTeachingHost, []);
  useEffect(() => {
    if (!open) return;
    // Counts as seen only if the window was visible when it went away.
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') closeTeaching();
    }, AUTO_HIDE_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setTimeout(closeTeaching, AUTO_HIDE_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
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
          (onOpenSettings ?? openFromShell)();
        }}
      >
        Open settings
      </button>
    </PopupBanner>
  );
}
