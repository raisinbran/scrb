import type { KeyboardEvent, PointerEvent } from 'react';
import styles from './ResizeHandle.module.css';

const KEYBOARD_STEP_PX = 16;

interface ResizeHandleProps {
  label: string;
  size: number;
  min: number;
  max: number;
  /** +1 when dragging right grows the panel, -1 when dragging left does. */
  direction: 1 | -1;
  onResize(size: number): void;
}

export function ResizeHandle({ label, size, min, max, direction, onResize }: ResizeHandleProps) {
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startSize = size;
    handle.setPointerCapture(event.pointerId);
    const onMove = (move: globalThis.PointerEvent) => {
      onResize(startSize + direction * (move.clientX - startX));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowLeft') onResize(size - direction * KEYBOARD_STEP_PX);
    if (event.key === 'ArrowRight') onResize(size + direction * KEYBOARD_STEP_PX);
  };

  return (
    <div
      className={styles.handle}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
