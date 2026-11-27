import type { ReactNode } from 'react';
import { useFocusFallback } from './Screen.tsx';
import styles from './SplitLayout.module.css';

/**
 * The one layout for screens with a list: a second column (title, optional pinned header, a
 * scrolling list) and a content panel. Every such screen uses it so width, padding, gutters and
 * scroll behaviour match exactly.
 */
export function SplitLayout({
  title,
  header,
  list,
  children,
}: {
  title: string;
  /** Pinned under the title: search, filters, actions. */
  header?: ReactNode;
  /** Scrolls on its own. */
  list: ReactNode;
  /** The content panel; it scrolls on its own too. */
  children: ReactNode;
}) {
  const heading = useFocusFallback();
  return (
    <div className={styles.split} data-split>
      <div className={styles.column}>
        <h1 ref={heading} className={styles.title} tabIndex={-1}>
          {title}
        </h1>
        {header && <div className={styles.header}>{header}</div>}
        <div className={styles.listScroll}>{list}</div>
      </div>
      <div className={styles.content} data-split-content>
        {children}
      </div>
    </div>
  );
}
