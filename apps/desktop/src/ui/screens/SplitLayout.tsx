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
  titleAction,
  header,
  list,
  children,
}: {
  title: string;
  /** Sits at the right end of the title row: a compact button or a search field. */
  titleAction?: ReactNode;
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
        <div className={styles.titleRow}>
          <h1 ref={heading} className={styles.title} tabIndex={-1}>
            {title}
          </h1>
          {titleAction}
        </div>
        {header && <div className={styles.header}>{header}</div>}
        <div className={styles.listScroll}>{list}</div>
      </div>
      <div className={styles.content} data-split-content>
        {children}
      </div>
    </div>
  );
}
