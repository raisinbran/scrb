import styles from './PlayingIndicator.module.css';

export const PLAYING_LABEL = 'Playing audio';

/** Three moving bars that show sound is playing. Still with reduced motion. Named for screen readers. */
export function PlayingIndicator({ className }: { className?: string | undefined }) {
  return (
    <span
      role="img"
      aria-label={PLAYING_LABEL}
      title={PLAYING_LABEL}
      className={`${styles.bars} ${className ?? ''}`}
    >
      <span className={styles.bar} />
      <span className={styles.bar} />
      <span className={styles.bar} />
    </span>
  );
}
