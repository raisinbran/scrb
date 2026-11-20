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
  const tip = useRef<HTMLSpanElement>(null);

  const hide = useCallback(() => setOpen(false), []);
  const show = useCallback(() => {
    const box = wrapper.current?.getBoundingClientRect();
    const tipBox = tip.current?.getBoundingClientRect();
    if (!box || !tipBox || !label) return;

    const edge = 8;
    const gap = 6;
    const width = tipBox.width;
    const height = tipBox.height;
    const center = box.left + box.width / 2;
    const x =
      width + edge * 2 >= window.innerWidth
        ? window.innerWidth / 2
        : Math.min(Math.max(center, width / 2 + edge), window.innerWidth - width / 2 - edge);
    const below = box.bottom + gap;
    const above = box.top - height - gap;
    const y =
      below + height <= window.innerHeight - edge
        ? below
        : above >= edge
          ? above
          : Math.max(edge, Math.min(below, window.innerHeight - height - edge));
    setPoint({ x, y });
    setOpen(true);
  }, [label]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    const onResize = () => {
      if (open) show();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open, hide, show]);

  // Focus that follows a mouse press is not keyboard focus, so it shows no instant tip.
  const pressed = useRef(false);
  const onFocus = () => {
    const keyboard = !pressed.current;
    pressed.current = false;
    if (keyboard) {
      show();
    }
  };

  // Keep the control's existing description (e.g., why Start is disabled) when the tip opens.
  const originalDescription = children.props['aria-describedby'];
  const activeDescription = [originalDescription, id].filter(Boolean).join(' ');

  return (
    <span
      ref={wrapper}
      className={styles.wrapper}
      onPointerEnter={show}
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
      {cloneElement(children, open ? { 'aria-describedby': activeDescription } : {})}
      {createPortal(
        <span
          ref={tip}
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
