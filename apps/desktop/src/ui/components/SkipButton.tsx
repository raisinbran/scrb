import { Tooltip } from './Tooltip.tsx';
import styles from './IconButton.module.css';

/** A thin open circular arrow with a small 15 inside, with air around the digits; clockwise skips forward, mirrored skips back. */
export function SkipButton({
  direction,
  disabled,
  onClick,
}: {
  direction: 'back' | 'forward';
  disabled?: boolean;
  onClick(): void;
}) {
  const label = direction === 'back' ? 'Skip back 15 seconds' : 'Skip forward 15 seconds';
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className={styles.button}
        onClick={onClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.skipIcon}>
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={direction === 'back' ? 'translate(24 0) scale(-1 1)' : undefined}
          >
            <path d="M17.14 6.87A8 8 0 1 1 8.62 5.75" />
            <path d="M6.96 4.01L10.9 4.7L8.9 8.17" />
          </g>
          <text
            x="12"
            y="15.2"
            textAnchor="middle"
            fontSize="7.5"
            fontWeight="600"
            fill="currentColor"
            stroke="none"
          >
            15
          </text>
        </svg>
      </button>
    </Tooltip>
  );
}
