import type { ReactNode, Ref } from 'react';
import { DismissButton } from './DismissButton.tsx';
import styles from './PopupBanner.module.css';

/**
 * Holds popup banners over the top of a panel's content, centred left to right. It has no height,
 * so a banner appearing or going never moves the content under it. Put it inside the panel, below
 * any header, tabs or toolbar, so a banner never covers a control. `stackRef` lets other components
 * add banners to the same stack.
 */
export function PopupLayer({
  children,
  stackRef,
}: {
  children?: ReactNode;
  stackRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div className={styles.layer}>
      <div ref={stackRef} className={styles.stack}>
        {children}
      </div>
    </div>
  );
}

interface PopupBannerProps {
  /** `alert` for errors the person must notice; `status` for everything else. */
  role?: 'alert' | 'status';
  level?: 'info' | 'warning' | 'danger';
  dismissLabel?: string;
  onDismiss?(): void;
  className?: string | undefined;
  children: ReactNode;
}

export function PopupBanner({
  role = 'status',
  level = 'info',
  dismissLabel = 'Dismiss',
  onDismiss,
  className,
  children,
}: PopupBannerProps) {
  return (
    <div
      className={[styles.banner, className].filter(Boolean).join(' ')}
      data-level={level}
      role={role}
    >
      <div className={styles.body}>{children}</div>
      {onDismiss && (
        <span className={styles.dismissSlot}>
          <DismissButton label={dismissLabel} onClick={onDismiss} />
        </span>
      )}
    </div>
  );
}
