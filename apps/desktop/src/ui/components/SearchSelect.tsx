import { useId, useRef, useState } from 'react';
import styles from './SearchSelect.module.css';

export interface SearchOption {
  value: string;
  label: string;
}

/** A dropdown you can type into. The control keeps one size; the list floats over what is below. */
export function SearchSelect({
  label,
  placeholder,
  options,
  value,
  disabled,
  autoFocus,
  describedBy,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: SearchOption[];
  value: string;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
  onChange(value: string): void;
}) {
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const chosen = options.find((option) => option.value === value);
  const term = query.trim().toLocaleLowerCase();
  const shown = term
    ? options.filter((option) => option.label.toLocaleLowerCase().includes(term))
    : options;

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (option: SearchOption) => {
    onChange(option.value);
    close();
  };
  const move = (step: number) => {
    setOpen(true);
    setActive((index) => Math.min(Math.max(index + step, 0), Math.max(shown.length - 1, 0)));
  };

  return (
    <div className={styles.wrap}>
      <input
        ref={input}
        type="text"
        role="combobox"
        className={styles.input}
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-describedby={describedBy}
        data-autofocus={autoFocus ? '' : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={open ? query : (chosen?.label ?? '')}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          } else if (event.key === 'Enter' && open && shown[active]) {
            event.preventDefault();
            pick(shown[active]);
          } else if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
          }
        }}
      />
      <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.chevron}>
        <path d="M6 9l6 6 6-6" />
      </svg>
      {open && !disabled && (
        <ul id={listId} role="listbox" aria-label={label} className={styles.list}>
          {shown.length === 0 && <li className={styles.none}>No match</li>}
          {shown.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={option.value === value}
              data-active={index === active ? '' : undefined}
              className={styles.option}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(option);
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
