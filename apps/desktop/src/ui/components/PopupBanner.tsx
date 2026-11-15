import type { ReactNode } from 'react';
import { DismissButton } from './DismissButton.tsx';
import styles from './PopupBanner.module.css';

/**
 * Holds popup banners over the top of a scrolling panel, centred left to right. It has no height,
 * so a banner appearing or going never moves the content under it. Put it first inside the panel.
 */
export function PopupLayer({ children }: { children: ReactNode }) {
  return (
    <div className={styles.layer}>
      <div className={styles.stack}>{children}</div>
    </div>
  );
}

interface PopupBannerProps {
  /** `alert` for errors the person must notice; `status` for everything else. */
  role?: 'alert' | 'status';
  level?: 'info' | 'warning' | 'danger';
  dismissLabel?: string;
  onDismiss?(): void;
  children: ReactNode;
}

export function PopupBanner({
  role = 'status',
  level = 'info',
  dismissLabel = 'Dismiss notice',
  onDismiss,
  children,
}: PopupBannerProps) {
  return (
    <div className={styles.banner} data-level={level} role={role}>
      <div className={styles.body}>{children}</div>
      {onDismiss && <DismissButton label={dismissLabel} onClick={onDismiss} />}
    </div>
  );
}
