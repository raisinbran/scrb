import { useEffect, useState } from 'react';
import styles from '../SettingsScreen.module.css';

export interface SettingsGroup {
  /** The id of the group's heading or fieldset. */
  id: string;
  label: string;
}

const groupOf = (id: string) => document.getElementById(id)?.closest('section, fieldset') ?? null;

/** Jump links to the settings groups; the group nearest the top of the screen is marked. */
export function SettingsNav({ groups }: { groups: SettingsGroup[] }) {
  const [active, setActive] = useState(groups[0]?.id ?? '');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.settingsGroup ?? '';
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = groups.find((group) => visible.has(group.id));
        if (first) setActive(first.id);
      },
      // Only the top part of the panel counts, so the group being read is the one marked.
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const group of groups) {
      const element = groupOf(group.id);
      if (element instanceof HTMLElement) {
        element.dataset.settingsGroup = group.id;
        observer.observe(element);
      }
    }
    return () => observer.disconnect();
  }, [groups]);

  const jump = (id: string) => {
    setActive(id);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    groupOf(id)?.scrollIntoView?.({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <nav className={styles.nav} aria-label="Settings groups">
      <ul className={styles.navList}>
        {groups.map((group) => (
          <li key={group.id}>
            <button
              type="button"
              className={styles.navItem}
              aria-current={active === group.id ? 'true' : undefined}
              onClick={() => jump(group.id)}
            >
              {group.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
