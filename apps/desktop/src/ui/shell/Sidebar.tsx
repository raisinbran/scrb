import { Fragment } from 'react';
import { isTranscribing, recordingTip } from '../components/RecordingDot.tsx';
import { PlayingIndicator } from '../components/PlayingIndicator.tsx';
import { useNowPlaying } from '../lib/playback-context.tsx';
import { Tooltip } from '../components/Tooltip.tsx';
import { SCREENS, type ScreenEntry, type ScreenId } from '../screens/index.ts';
import { useRecordingStatus } from './use-recording-status.ts';
import { useAnyProcessing } from './use-processing.ts';
import styles from './Sidebar.module.css';

interface SidebarProps {
  selected: ScreenId;
  onSelect(id: ScreenId): void;
  /** Icons only; the labels stay for screen readers and show in tooltips. */
  collapsed: boolean;
  /** False while the window is too narrow to leave it open. */
  canToggle: boolean;
  onToggle(): void;
}

export function Sidebar({ selected, onSelect, collapsed, canToggle, onToggle }: SidebarProps) {
  const { recording, lag } = useRecordingStatus();
  const nowPlaying = useNowPlaying();
  const processing = useAnyProcessing();
  const dot =
    recording.status === 'recording' || recording.status === 'paused' ? recording.status : null;
  const tip = dot ? recordingTip(dot, isTranscribing(lag)) : '';
  const item = (screen: ScreenEntry) => {
    const button = (
      <button
        key={screen.id}
        type="button"
        className={collapsed ? `${styles.item} ${styles.itemCollapsed}` : styles.item}
        aria-current={screen.id === selected ? 'page' : undefined}
        aria-describedby={
          screen.id === 'recordings' && processing ? 'recordings-processing' : undefined
        }
        onClick={() => onSelect(screen.id)}
      >
        {screen.id === 'live' && dot ? (
          <svg
            className={`${styles.icon} ${styles.micLive}`}
            data-state={dot}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d={screen.icon} />
          </svg>
        ) : screen.id === 'recordings' ? (
          <span className={styles.discWrap}>
            <svg
              className={`${styles.icon} ${processing ? styles.spin : ''}`}
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d={screen.icon} />
            </svg>
            {processing && <span className={styles.badge} aria-hidden="true" />}
          </span>
        ) : (
          <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
            <path d={screen.icon} />
          </svg>
        )}
        <span className={collapsed ? styles.hidden : undefined}>{screen.label}</span>
        {/* Named after the label so the button's own name still starts with it. */}
        {screen.id === 'live' && dot && (
          <span role="img" className={styles.hidden} aria-label={tip} />
        )}
        {screen.id === 'recordings' && nowPlaying && !collapsed && (
          <PlayingIndicator className={styles.playing} />
        )}
      </button>
    );
    // The button is the focus target, so its tooltip explains the dot for keyboard users too.
    // The Live item is always wrapped, so the button is not remounted when a recording starts.
    return screen.id === 'live' ? (
      <Tooltip key={screen.id} label={collapsed ? (tip ? `Live: ${tip}` : screen.label) : tip}>
        {button}
      </Tooltip>
    ) : screen.id === 'recordings' ? (
      <Fragment key={screen.id}>
        {collapsed ? <Tooltip label={screen.label}>{button}</Tooltip> : button}
        {/* Outside the button, so it describes it without becoming part of its name. */}
        {processing && (
          <span id="recordings-processing" className={styles.hidden}>
            Background work pending
          </span>
        )}
      </Fragment>
    ) : collapsed ? (
      <Tooltip key={screen.id} label={screen.label}>
        {button}
      </Tooltip>
    ) : (
      button
    );
  };
  const pinned = SCREENS.filter((screen) => screen.pinnedToBottom);

  return (
    <nav
      className={collapsed ? `${styles.sidebar} ${styles.sidebarCollapsed}` : styles.sidebar}
      aria-label="Main"
    >
      <div className={styles.group}>
        <Tooltip label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.toggle}`}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            disabled={!canToggle}
            onClick={onToggle}
          >
            <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
              <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
            </svg>
          </button>
        </Tooltip>
        {SCREENS.filter((s) => !s.pinnedToBottom).map(item)}
      </div>
      <div className={collapsed ? `${styles.footer} ${styles.footerCollapsed}` : styles.footer}>
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
