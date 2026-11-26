import { useEffect, useRef, useState } from 'react';
import styles from '../SettingsScreen.module.css';

export interface SettingsGroup {
  /** The id of the group's heading. */
  id: string;
  label: string;
}

const groupOf = (id: string) => document.getElementById(id)?.closest('section') ?? null;

function readingOffset(nav: HTMLElement, section: HTMLElement) {
  const menu = nav.getBoundingClientRect();
  const topInset = parseFloat(getComputedStyle(nav).insetBlockStart) || 0;
  const gap = parseFloat(getComputedStyle(section).scrollMarginBlockStart) || 0;
  return menu.right > section.getBoundingClientRect().left ? menu.height + topInset + gap : gap;
}

export function SettingsNav({ groups }: { groups: SettingsGroup[] }) {
  const nav = useRef<HTMLElement>(null);
  const [active, setActive] = useState(groups[0]?.id ?? '');

  useEffect(() => {
    const menu = nav.current;
    const workspace = menu?.closest('main');
    const sections = groups.flatMap(({ id }) => {
      const section = groupOf(id);
      return section ? [{ id, section }] : [];
    });
    const first = sections[0];
    const last = sections.at(-1);
    if (!menu || !workspace || !first || !last) return;

    const update = () => {
      const { scrollTop, clientHeight, scrollHeight } = workspace;
      const remaining = scrollHeight - clientHeight - scrollTop;
      const offset = readingOffset(menu, first.section);
      // Near the end, short sections may never reach the top of the workspace.
      const tail = Math.max(0, (clientHeight - offset) * 0.6 - remaining);
      const line = workspace.getBoundingClientRect().top + offset + tail + 1;
      if (scrollTop > 0 && remaining <= 1) {
        setActive(last.id);
        return;
      }
      const current = sections.findLast(
        ({ section }) => section.getBoundingClientRect().top <= line,
      );
      setActive(current?.id ?? first.id);
    };

    workspace.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    for (const element of [workspace, menu, ...sections.map(({ section }) => section)]) {
      observer?.observe(element);
    }
    update();
    return () => {
      workspace.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [groups]);

  const jump = (id: string) => {
    const section = groupOf(id);
    const menu = nav.current;
    const workspace = menu?.closest('main');
    if (!section || !menu || !workspace) return;
    const top =
      workspace.scrollTop +
      section.getBoundingClientRect().top -
      workspace.getBoundingClientRect().top -
      readingOffset(menu, section);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const end = workspace.scrollHeight - workspace.clientHeight;
    const target = id === groups.at(-1)?.id ? end : Math.min(top, Math.max(0, end - 2));
    workspace.scrollTo({ top: target, behavior: reduced ? 'instant' : 'smooth' });
  };

  return (
    <nav ref={nav} className={styles.nav} aria-label="Settings groups">
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
