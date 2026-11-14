import type { ButtonHTMLAttributes } from 'react';
import { Tooltip } from './Tooltip.tsx';
import styles from './IconButton.module.css';

/** SVG paths on a 24-unit grid, drawn as strokes. */
export const ICONS = {
  back: 'M15 6l-6 6 6 6',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  export: 'M12 15V3M7 8l5-5 5 5M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  speaker: 'M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7',
  speakerOff: 'M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6',
  textSmaller: 'M3 19l6-13 6 13M5.5 14h7M17 9h5',
  textLarger: 'M3 19l6-13 6 13M5.5 14h7M17 9h5M19.5 6.5v5',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  audioFolder:
    'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 12v3M12 10v6M15 12v3',
} as const;

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** The accessible name and the tooltip. */
  label: string;
  icon: keyof typeof ICONS;
  /** Longer tooltip text, when the name alone does not explain the button. */
  tip?: string;
  danger?: boolean;
}

/** A fixed-size square button that shows only an icon; the label is its name and tooltip. */
export function IconButton({ label, icon, tip, danger, className, ...props }: IconButtonProps) {
  const classes = [styles.button, danger && styles.danger, className].filter(Boolean).join(' ');
  return (
    <Tooltip label={tip ?? label}>
      <button type="button" aria-label={label} {...props} className={classes}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
          <path d={ICONS[icon]} />
        </svg>
      </button>
    </Tooltip>
  );
}
