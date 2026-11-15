import { isTranscribing, pulseClass, recordingTip } from '../components/RecordingDot.tsx';
import { PlayingIndicator } from '../components/PlayingIndicator.tsx';
import { useNowPlaying } from '../lib/playback-context.tsx';
import { Tooltip } from '../components/Tooltip.tsx';
import { SCREENS, type ScreenEntry, type ScreenId } from '../screens/index.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selected: ScreenId;
  onSelect(id: ScreenId): void;
}

export function Sidebar({ selected, onSelect }: SidebarProps) {
  const { recording, lag } = useRecordingStatus();
  const nowPlaying = useNowPlaying();
  const dot =
    recording.status === 'recording' || recording.status === 'paused' ? recording.status : null;
  const tip = dot ? recordingTip(dot, isTranscribing(lag)) : '';
  const item = (screen: ScreenEntry) => {
    const button = (
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
            className={`${styles.dot} ${pulseClass(dot)}`}
            data-state={dot}
            aria-label={tip}
          />
        )}
        {screen.id === 'recordings' && nowPlaying && (
          <PlayingIndicator className={styles.playing} />
        )}
      </button>
    );
    // The button is the focus target, so its tooltip explains the dot for keyboard users too.
    // The Live item is always wrapped, so the button is not remounted when a recording starts.
    return screen.id === 'live' ? (
      <Tooltip key={screen.id} label={tip}>
        {button}
      </Tooltip>
    ) : (
      button
    );
  };
  const pinned = SCREENS.filter((screen) => screen.pinnedToBottom);

  return (
    <nav className={styles.sidebar} aria-label="Main">
      <div className={styles.group}>{SCREENS.filter((s) => !s.pinnedToBottom).map(item)}</div>
      <div className={styles.footer}>
        {pinned.map((screen) => (
          <Tooltip key={screen.id} label={screen.label}>
            <button
              type="button"
              className={styles.iconButton}
              aria-label={screen.label}
              aria-current={screen.id === selected ? 'page' : undefined}
              onClick={() => onSelect(screen.id)}
            >
              <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
                <path d={screen.icon} />
              </svg>
            </button>
          </Tooltip>
        ))}
      </div>
    </nav>
  );
}
