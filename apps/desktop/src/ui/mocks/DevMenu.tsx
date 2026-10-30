import { useEffect, useState } from 'react';
import { DEV_TRIGGERS } from './dev-triggers.ts';
import type { MockBackend } from './mock-backend.ts';
import styles from './DevMenu.module.css';

const groups = [...new Set(DEV_TRIGGERS.map((trigger) => trigger.group))];

/** Hidden menu for forcing screen states, opened with Ctrl+Shift+Alt+D. Mock backend only. */
export function DevMenu({ backend }: { backend: MockBackend }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.altKey && event.code === 'KeyD') {
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!open) return null;
  return (
    <aside className={styles.menu} aria-label="Developer menu">
      <h2 className={styles.title}>Mock backend</h2>
      {groups.map((group) => (
        <section key={group}>
          <h3 className={styles.group}>{group}</h3>
          {DEV_TRIGGERS.filter((trigger) => trigger.group === group).map((trigger) => (
            <button
              key={trigger.id}
              type="button"
              className={styles.trigger}
              data-trigger={trigger.id}
              onClick={() => trigger.run(backend)}
            >
              {trigger.label}
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}
