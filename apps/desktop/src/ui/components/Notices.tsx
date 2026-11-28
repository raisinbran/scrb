import { useEffect, useState, type ReactNode } from 'react';
import { DismissButton } from './DismissButton.tsx';
import styles from './Notices.module.css';

/**
 * Holds notice and alert strips in the page flow, one width and one left edge, with no height of its
 * own when empty. Put it directly below a screen's control bar, never above it, so a strip that
 * appears nudges the content and never the controls.
 */
export function NoticeStack({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string | undefined;
}) {
  return <div className={[styles.stack, className].filter(Boolean).join(' ')}>{children}</div>;
}

interface StripAction {
  label: string;
  onClick(): void;
}

function Strip({
  type,
  role,
  action,
  onDismiss,
  dismissLabel = 'Dismiss',
  progress,
  label,
  children,
}: {
  type: 'notice' | 'alert';
  role: 'status' | 'alert';
  action?: StripAction | undefined;
  onDismiss?: (() => void) | undefined;
  dismissLabel?: string | undefined;
  progress?: ReactNode;
  label?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      aria-label={label}
      className={styles.strip}
      data-type={type}
      data-progress={progress ? '' : undefined}
      role={role}
    >
      <div className={styles.text}>{children}</div>
      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
      {onDismiss && (
        <span className={styles.dismissSlot}>
          <DismissButton label={dismissLabel} onClick={onDismiss} />
        </span>
      )}
      {progress && <div className={styles.progress}>{progress}</div>}
    </div>
  );
}

/**
 * Type A, persistent notice: slim, one line, text left, the shared X on the right. Leave `onDismiss`
 * out only for a notice that ends by itself with its condition (for example "still recording").
 */
export function NoticeStrip(props: {
  onDismiss?: () => void;
  dismissLabel?: string;
  action?: StripAction;
  progress?: ReactNode;
  children: ReactNode;
}) {
  return <Strip type="notice" role="status" {...props} />;
}

/**
 * Type B, alert: danger-tinted, one line, an optional action button, no X. The owner of the
 * condition renders it only while the condition lasts.
 */
export function AlertStrip({
  action,
  role = 'alert',
  label,
  children,
}: {
  action?: StripAction | undefined;
  label?: string;
  role?: 'alert' | 'status';
  children: ReactNode;
}) {
  return (
    <Strip type="alert" role={role} action={action} label={label}>
      {children}
    </Strip>
  );
}

export const TOAST_MS = 5000;

/**
 * Type C, toast: bottom-centre dark pill with one short line, no X, gone after about five seconds.
 * Counts the time only while the window is visible, and calls `onGone` when it goes. Give it a
 * `message` (or null for nothing); a new message restarts the time. With `onClick` the pill is one
 * button.
 */
export function Toast({
  message,
  role = 'status',
  onGone,
  onClick,
  ms = TOAST_MS,
}: {
  message: string | null;
  role?: 'status' | 'alert';
  onGone?: () => void;
  onClick?: () => void;
  ms?: number;
}) {
  // The message that has run its time; a different message shows again.
  const [spent, setSpent] = useState<string | null>(null);
  if (message === null && spent !== null) setSpent(null);
  const shown = message !== null && message !== spent ? message : null;
  useEffect(() => {
    if (shown === null) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      timer = setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        setSpent(shown);
        onGone?.();
      }, ms);
    };
    start();
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      start();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, ms]);
  if (shown === null) return null;
  return onClick ? (
    <button type="button" className={styles.toast} onClick={onClick}>
      {shown}
    </button>
  ) : (
    <div className={styles.toast} role={role}>
      {shown}
    </div>
  );
}
