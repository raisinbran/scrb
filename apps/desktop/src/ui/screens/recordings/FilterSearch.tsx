import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import styles from './filterSearch.module.css';

export type Origin = 'recorded' | 'imported' | '';

type Step = 'menu' | 'source' | 'from' | 'to';

const KEYWORDS: Record<string, Step> = { source: 'source', from: 'from', to: 'to' };
const ORIGIN_LABELS = { recorded: 'Recorded', imported: 'Imported' } as const;

/** 2026-10-01 becomes 10/01/26, the way the date field reads in the US. */
const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${month}/${day}/${year.slice(2)}` : iso;
};

interface Props {
  inputRef: RefObject<HTMLInputElement | null>;
  text: string;
  onText(next: string): void;
  origin: Origin;
  from: string;
  to: string;
  onOrigin(next: Origin): void;
  onFrom(next: string): void;
  onTo(next: string): void;
}

/**
 * One search field that also holds the filters as chips. Click it, press Down, type "source:",
 * "from:" or "to:", or use the filter button to open the list of filters; a picked filter becomes a
 * chip inside the field that the x or Backspace (on empty text) removes. The field wraps as chips grow.
 */
export function FilterSearch({
  inputRef,
  text,
  onText,
  origin,
  from,
  to,
  onOrigin,
  onFrom,
  onTo,
}: Props) {
  const [step, setStep] = useState<Step | null>(null);
  const [focusFirst, setFocusFirst] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const open = (next: Step, focus: boolean) => {
    setStep(next);
    setFocusFirst(focus);
  };
  const close = (refocus: boolean) => {
    setStep(null);
    if (refocus) inputRef.current?.focus();
  };

  // Keyboard users land on the first choice of whatever list just opened.
  useEffect(() => {
    if (step === null || !focusFirst) return;
    popover.current?.querySelector<HTMLElement>('[role^="menuitem"], input')?.focus();
  }, [step, focusFirst]);

  useEffect(() => {
    if (step === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setStep(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [step]);

  const chips: { id: string; label: string; name: string; clear(): void }[] = [];
  if (origin)
    chips.push({
      id: 'source',
      label: `Source: ${ORIGIN_LABELS[origin]}`,
      name: 'Source',
      clear: () => onOrigin(''),
    });
  if (from)
    chips.push({
      id: 'from',
      label: `From: ${shortDate(from)}`,
      name: 'From',
      clear: () => onFrom(''),
    });
  if (to)
    chips.push({ id: 'to', label: `To: ${shortDate(to)}`, name: 'To', clear: () => onTo('') });

  const change = (value: string) => {
    const match = /(^|\s)(source|from|to):$/i.exec(value);
    if (match) {
      onText(value.slice(0, match.index).trimEnd());
      open(KEYWORDS[(match[2] as string).toLowerCase()] as Step, true);
      return;
    }
    onText(value);
  };

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open('menu', true);
    } else if (event.key === 'Escape' && step !== null) {
      event.preventDefault();
      close(false);
    } else if (event.key === 'Backspace' && text === '' && chips.length > 0) {
      chips[chips.length - 1]?.clear();
    }
  };

  const onPopoverKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (step === 'menu') close(true);
      else open('menu', true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const items = [...(popover.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    if (items.length === 0) return;
    event.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[at === -1 ? 0 : next]?.focus();
  };

  return (
    <div
      ref={wrap}
      className={styles.wrap}
      onBlur={(event) => {
        // Tab or focus moving outside the field and its popover closes the popover.
        if (step !== null && !event.currentTarget.contains(event.relatedTarget as Node | null))
          setStep(null);
      }}
    >
      <div
        role="group"
        aria-label="Search and filters"
        className={styles.field}
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {chips.map((chip) => (
          <span key={chip.id} className={styles.chip}>
            {chip.label}
            <button
              type="button"
              className={styles.chipRemove}
              aria-label={`Remove ${chip.name} filter`}
              onClick={() => {
                chip.clear();
                inputRef.current?.focus();
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.chipIcon}>
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="search"
          className={styles.input}
          aria-label="Search recordings"
          aria-haspopup={step === 'from' || step === 'to' ? 'dialog' : 'menu'}
          aria-expanded={step !== null}
          aria-controls={step === null ? undefined : popoverId}
          placeholder={chips.length > 0 ? 'Search' : 'Search titles, dates and transcripts'}
          value={text}
          onChange={(event) => change(event.target.value)}
          onKeyDown={onInputKey}
        />
        <button
          ref={filterButton}
          type="button"
          className={styles.filterButton}
          aria-label="Filters"
          aria-haspopup={step === 'from' || step === 'to' ? 'dialog' : 'menu'}
          aria-expanded={step !== null}
          aria-controls={step === null ? undefined : popoverId}
          onClick={() => (step === null ? open('menu', true) : close(false))}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.filterIcon}>
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
        </button>
      </div>
      {step !== null && (
        <div
          ref={popover}
          id={popoverId}
          className={styles.popover}
          role={step === 'from' || step === 'to' ? 'dialog' : 'menu'}
          aria-label={
            step === 'source'
              ? 'Source'
              : step === 'menu'
                ? 'Filters'
                : `${step === 'from' ? 'From' : 'To'} date`
          }
          onKeyDown={onPopoverKey}
        >
          {step === 'menu' && (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => open('source', true)}
              >
                Source
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => open('from', true)}
              >
                From
              </button>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => open('to', true)}
              >
                To
              </button>
            </>
          )}
          {step === 'source' &&
            (['recorded', 'imported'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={origin === value}
                className={styles.item}
                onClick={() => {
                  onOrigin(origin === value ? '' : value);
                  setStep(null);
                  inputRef.current?.focus();
                }}
              >
                {ORIGIN_LABELS[value]}
              </button>
            ))}
          {(step === 'from' || step === 'to') && (
            <label className={styles.date}>
              {step === 'from' ? 'From' : 'To'}
              <input
                type="date"
                className={styles.dateInput}
                value={step === 'from' ? from : to}
                onChange={(event) => {
                  (step === 'from' ? onFrom : onTo)(event.target.value);
                  if (event.target.value) close(true);
                }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
