import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

/** Pointer hover waits this long; keyboard focus shows the tip at once. */
export const TOOLTIP_DELAY_MS = 100;

interface Point {
  x: number;
  y: number;
}

/**
 * Wraps one control (usually an icon button) and shows its name in a small bubble.
 * The control gets aria-describedby while the bubble is open. Hides on leave, blur, Escape, click.
 */
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId();
  const [point, setPoint] = useState<Point | null>(null);
  // The bubble stays mounted at its last place so it can fade out; `open` drives visibility.
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);
  const show = useCallback(() => {
    const box = wrapper.current?.getBoundingClientRect();
    if (box && label) {
      setPoint({ x: box.left + box.width / 2, y: box.bottom + 6 });
      setOpen(true);
    }
  }, [label]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide]);

  // Focus that follows a mouse press is not keyboard focus, so it shows no instant tip.
  const pressed = useRef(false);
  const onFocus = () => {
    const keyboard = !pressed.current;
    pressed.current = false;
    if (keyboard) {
      clearTimeout(timer.current);
      show();
    }
  };

  return (
    <span
      ref={wrapper}
      className={styles.wrapper}
      onPointerEnter={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(show, TOOLTIP_DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={() => {
        pressed.current = true;
        hide();
      }}
      onPointerUp={() => {
        pressed.current = false;
      }}
      onFocus={onFocus}
      onBlur={hide}
    >
      {cloneElement(children, open ? { 'aria-describedby': id } : {})}
      {createPortal(
        <span
          id={id}
          role="tooltip"
          className={styles.tip}
          aria-hidden={!open}
          data-open={open || undefined}
          style={point ? { left: point.x, top: point.y } : undefined}
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  );
}
