import { Tooltip } from '../components/Tooltip.tsx';
import { SCREENS, type ScreenEntry, type ScreenId } from '../screens/index.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selected: ScreenId;
  settingsOpen: boolean;
  onSelect(id: ScreenId): void;
  onOpenSettings(): void;
}

const GEAR_ICON =
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z';

export function Sidebar({ selected, settingsOpen, onSelect, onOpenSettings }: SidebarProps) {
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
  const help = SCREENS.find((screen) => screen.id === 'help');

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <div className={styles.group}>{SCREENS.filter((s) => !s.pinnedToBottom).map(item)}</div>
      <div className={styles.footer}>
        <Tooltip label="Settings">
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={onOpenSettings}
          >
            <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
              <path d={GEAR_ICON} />
            </svg>
          </button>
        </Tooltip>
        {help && (
          <Tooltip label="Help">
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Help"
              aria-current={help.id === selected ? 'page' : undefined}
              onClick={() => onSelect(help.id)}
            >
              <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                <path d={help.icon} />
              </svg>
            </button>
          </Tooltip>
        )}
      </div>
    </nav>
  );
}
