import { useEffect, useRef, type ReactNode } from 'react';
import type { BackendData } from '../lib/use-backend-data.ts';
import styles from './Screen.module.css';

/**
 * Restore the heading when a screen opens with nothing focused, or when the focused control is
 * removed. Focus the user left on the body, for example by clicking blank space, stays there.
 */
export function useFocusFallback() {
  const heading = useRef<HTMLHeadingElement>(null);
  const lastFocused = useRef<Element | null>(null);
  const opened = useRef(false);
  useEffect(() => {
    const track = (event: FocusEvent) => {
      lastFocused.current = event.target as Element;
    };
    // Chromium also fires focusout when a focused element is removed, so release the element only
    // if it is still in the page after the current task's script has finished.
    const release = (event: FocusEvent) => {
      const target = event.target as Element;
      queueMicrotask(() => {
        if (target.isConnected && lastFocused.current === target) lastFocused.current = null;
      });
    };
    document.addEventListener('focusin', track);
    document.addEventListener('focusout', release);
    return () => {
      document.removeEventListener('focusin', track);
      document.removeEventListener('focusout', release);
    };
  }, []);
  useEffect(() => {
    const lost =
      !opened.current || (lastFocused.current !== null && !lastFocused.current.isConnected);
    opened.current = true;
    if (lost && document.activeElement === document.body) heading.current?.focus();
  });
  return heading;
}

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const heading = useFocusFallback();
  return (
    <div className={styles.screen}>
      <h1 ref={heading} className={styles.title} tabIndex={-1}>
        {title}
      </h1>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {children && <p className={styles.emptyBody}>{children}</p>}
    </div>
  );
}

/** Renders the loading and failed states shared by every screen's first load. */
export function DataView<T>({
  state,
  children,
}: {
  state: BackendData<T>;
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <p role="status">Loading…</p>;
  if (state.status === 'failed') return <p role="alert">{state.message}</p>;
  return <>{children(state.data)}</>;
}

export function ItemList({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

export function Item({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <li className={styles.item}>
      <span>{primary}</span>
      {secondary && <span className={styles.secondary}>{secondary}</span>}
    </li>
  );
}
