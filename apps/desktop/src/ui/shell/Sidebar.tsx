import { SCREENS, type ScreenEntry, type ScreenId } from '../screens/index.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selected: ScreenId;
  onSelect(id: ScreenId): void;
}

export function Sidebar({ selected, onSelect }: SidebarProps) {
  const { recording } = useRecordingStatus();
  const dot =
    recording.status === 'recording' || recording.status === 'paused' ? recording.status : null;
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
      {screen.id === 'live' && dot && (
        <span
          role="img"
          className={styles.dot}
          data-state={dot}
          aria-label={dot === 'paused' ? 'Recording paused' : 'Recording in progress'}
        />
      )}
    </button>
  );

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <div className={styles.group}>{SCREENS.filter((s) => !s.pinnedToBottom).map(item)}</div>
      <div className={styles.group}>{SCREENS.filter((s) => s.pinnedToBottom).map(item)}</div>
    </nav>
  );
}
