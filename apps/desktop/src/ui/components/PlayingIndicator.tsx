import { Tooltip } from './Tooltip.tsx';
import styles from './PlayingIndicator.module.css';

export const PLAYING_LABEL = 'Playing audio';

/** Three moving bars that show sound is playing. Still with reduced motion. Named for screen readers. */
export function PlayingIndicator({ className }: { className?: string | undefined }) {
  return (
    <Tooltip label={PLAYING_LABEL}>
      <span role="img" aria-label={PLAYING_LABEL} className={`${styles.bars} ${className ?? ''}`}>
        <span className={styles.bar} />
        <span className={styles.bar} />
        <span className={styles.bar} />
      </span>
    </Tooltip>
  );
}
