import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem } from './Menu.tsx';
import styles from './Menu.module.css';

interface ContextMenuProps {
  label: string;
  /** Viewport position of the right-click. */
  at: { x: number; y: number };
  items: (MenuItem & { disabled?: boolean })[];
  onClose(): void;
}

/** A menu opened at the pointer. It lives in the page, so no extra IPC or native menu is needed. */
export function ContextMenu({ label, at, items, onClose }: ContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    const outside = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', outside);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const entries = [...(menu.current?.querySelectorAll('button:not(:disabled)') ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      (
        entries[(index + step + entries.length) % entries.length] as HTMLElement | undefined
      )?.focus();
    }
  };

  return createPortal(
    <div
      ref={menu}
      className={styles.menu}
      role="menu"
      aria-label={label}
      style={{ top: at.y, left: at.x }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={styles.item}
          role="menuitem"
          disabled={item.disabled}
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
