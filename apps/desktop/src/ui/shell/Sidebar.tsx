import { SCREENS, type ScreenEntry, type ScreenId } from '../screens/index.ts';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selected: ScreenId;
  onSelect(id: ScreenId): void;
}

export function Sidebar({ selected, onSelect }: SidebarProps) {
  const item = (screen: ScreenEntry) => (
    <button
      key={screen.id}
      type="button"
      className={styles.item}
      aria-current={screen.id === selected ? 'page' : undefined}
      onClick={() => onSelect(screen.id)}
    >
      <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
        <path d={screen.icon} />
      </svg>
      {screen.label}
    </button>
  );

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <div className={styles.group}>{SCREENS.filter((s) => !s.pinnedToBottom).map(item)}</div>
      <div className={styles.group}>{SCREENS.filter((s) => s.pinnedToBottom).map(item)}</div>
    </nav>
  );
}
