import { createContext, useContext, useEffect } from 'react';
import { closeTeaching, registerTeachingHost, useTeachingOpen } from '../lib/notification-prefs.ts';
import { Toast } from './Notices.tsx';

/** How the pointer reaches Settings > Notifications; the app shell provides it. */
export const OpenNotificationSettings = createContext<() => void>(() => undefined);

/** Type C toast, shown once after the first optional banner is dismissed. Clicking it opens the settings. */
export function TeachingToast({ onOpenSettings }: { onOpenSettings?: () => void } = {}) {
  const open = useTeachingOpen();
  const openFromShell = useContext(OpenNotificationSettings);
  useEffect(registerTeachingHost, []);
  if (!open) return null;
  return (
    <Toast
      message="Turn banners on or off in Settings > Notifications."
      onGone={closeTeaching}
      onClick={() => {
        closeTeaching();
        (onOpenSettings ?? openFromShell)();
      }}
    />
  );
}
