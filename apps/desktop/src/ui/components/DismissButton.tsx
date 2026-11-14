import styles from './DismissButton.module.css';

export function DismissButton({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" className={styles.dismiss} aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
