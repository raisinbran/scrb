import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Menu.module.css';

export interface MenuItem {
  label: string;
  onSelect(): void;
}

interface MenuButtonProps {
  /** Accessible name of the button. */
  label: string;
  className?: string;
  items: MenuItem[];
  children: ReactNode;
}

/** A button that opens a menu. Arrow keys move, Escape closes, focus returns to the button. */
export function MenuButton({ label, className, items, children }: MenuButtonProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const toggle = () => {
    const rect = button.current?.getBoundingClientRect();
    setPosition(open || !rect ? null : { top: rect.bottom + 4, left: rect.left });
  };

  const close = () => {
    setPosition(null);
    button.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll('button') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % entries.length,
      ArrowUp: (index - 1 + entries.length) % entries.length,
      Home: 0,
      End: entries.length - 1,
    };
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
    } else if (event.key in targets) {
      event.preventDefault();
      entries[targets[event.key] as number]?.focus();
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        {children}
      </button>
      {position &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            className={styles.menu}
            role="menu"
            aria-label={label}
            style={position}
            onKeyDown={onKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={styles.item}
                role="menuitem"
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
