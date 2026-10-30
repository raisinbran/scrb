import type { ReactNode } from 'react';
import type { BackendData } from '../lib/use-backend-data.ts';
import styles from './Screen.module.css';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>{title}</h1>
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
