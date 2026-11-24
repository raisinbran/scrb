import { useEffect, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem } from './Menu.tsx';
import styles from './Menu.module.css';

export const CONTEXT_MENU_MARK = 'data-context-menu';

interface ContextMenuProps {
  label: string;
  /** Viewport position of the pointer that opened the menu. */
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
}

/** A right-click menu. Arrow keys move, Escape or a click elsewhere closes it. */
export function ContextMenu({ label, x, y, items, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector('button')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [onClose]);

  const onKeyDown = (event: KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll('button') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    }
  };

  return createPortal(
    <div
      ref={menu}
      className={styles.menu}
      role="menu"
      aria-label={label}
      style={{ top: y, left: x }}
      {...{ [CONTEXT_MENU_MARK]: '' }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={styles.item}
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
