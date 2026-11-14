import styles from './Progress.module.css';

interface ProgressProps {
  label: string;
  /** 0 to 1. Leave out when the backend reports no progress; the bar then only shows that work is under way. */
  fraction?: number | undefined;
}

export function Progress({ label, fraction }: ProgressProps) {
  const known = fraction !== undefined && Number.isFinite(fraction);
  const percent = known ? Math.round(Math.min(1, Math.max(0, fraction)) * 100) : null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      {...(percent === null ? {} : { 'aria-valuenow': percent })}
      className={styles.track}
    >
      <div
        className={percent === null ? `${styles.fill} ${styles.unknown}` : styles.fill}
        {...(percent === null ? {} : { style: { width: `${percent}%` } })}
      />
    </div>
  );
}
