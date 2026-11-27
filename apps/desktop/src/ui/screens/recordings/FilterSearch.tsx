import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Button } from '../../components/Button.tsx';
import { Dialog, DialogActions } from '../../components/Dialog.tsx';
import styles from './filterSearch.module.css';

export type Origin = 'recorded' | 'imported' | '';

type Step = 'menu' | 'source' | 'from' | 'to';
type MenuRow = (typeof ROWS)[number]['id'];

const KEYWORDS: Record<string, Step> = { source: 'source', from: 'from', to: 'to' };
const ORIGIN_LABELS = { recorded: 'Recorded', imported: 'Imported' } as const;

/** 2026-10-01 becomes 10/01/26, the way the date field reads in the US. */
const shortDate = (iso: string) => {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${month}/${day}/${year.slice(2)}` : iso;
};

const ICONS: Record<string, string> = {
  source: 'M4 7h6l2 2h8v9H4z',
  from: 'M5 6h14v13H5z M5 10h14 M9 4v3 M15 4v3 M12 13v3 M10.5 14.5L12 13l1.5 1.5',
  to: 'M5 6h14v13H5z M5 10h14 M9 4v3 M15 4v3 M12 16v-3 M10.5 14.5L12 16l1.5-1.5',
  more: 'M4 7h9 M17 7h3 M4 17h3 M11 17h9 M15 4.5v5 M9 14.5v5',
};

function RowIcon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.rowIcon}>
      <path d={ICONS[name]} />
    </svg>
  );
}

/** The rows of the Filters list: plain wording on top, the keyword that does the same typed below. */
const ROWS = [
  {
    id: 'source',
    title: 'From a specific source',
    keyword: 'source:',
    hint: 'recorded or imported',
  },
  { id: 'from', title: 'Recorded after a date', keyword: 'from:', hint: 'date' },
  { id: 'to', title: 'Recorded before a date', keyword: 'to:', hint: 'date' },
  { id: 'more', title: 'More filters', keyword: '', hint: 'dates, sources and more' },
] as const;

type DateKind = 'from' | 'to';
interface DateRow {
  kind: DateKind;
  date: string;
}

function MoreFilters({
  origin,
  from,
  to,
  onApply,
  onCancel,
}: {
  origin: Origin;
  from: string;
  to: string;
  onApply(next: { origin: Origin; from: string; to: string }): void;
  onCancel(): void;
}) {
  const [draftOrigin, setDraftOrigin] = useState<Origin>(origin);
  const [rows, setRows] = useState<DateRow[]>(() => [
    ...(from ? [{ kind: 'from' as const, date: from }] : []),
    ...(to ? [{ kind: 'to' as const, date: to }] : []),
  ]);
  const count = (draftOrigin ? 1 : 0) + rows.filter((row) => row.date).length;
  const used = (kind: DateKind, at: number) =>
    rows.some((row, index) => index !== at && row.kind === kind);
  const update = (at: number, patch: Partial<DateRow>) =>
    setRows((current) => current.map((row, index) => (index === at ? { ...row, ...patch } : row)));
  const apply = () =>
    onApply({
      origin: draftOrigin,
      from: rows.find((row) => row.kind === 'from')?.date ?? '',
      to: rows.find((row) => row.kind === 'to')?.date ?? '',
    });
  return (
    <Dialog title="Filters" onClose={onCancel}>
      <div className={styles.moreBody}>
        <label className={styles.moreField}>
          <span className={styles.moreLabel}>Source</span>
          <span className={styles.moreHint}>Where the recording came from</span>
          <select
            data-autofocus
            value={draftOrigin}
            onChange={(event) => setDraftOrigin(event.target.value as Origin)}
          >
            <option value="">Any source</option>
            <option value="recorded">Recorded</option>
            <option value="imported">Imported</option>
          </select>
        </label>
        <div className={styles.moreField} role="group" aria-label="Date">
          <span className={styles.moreLabel}>Date</span>
          <span className={styles.moreHint}>When the recording was made</span>
          {rows.map((row, at) => (
            <div key={row.kind} className={styles.dateRow}>
              <select
                aria-label="Date comparison"
                value={row.kind}
                onChange={(event) => update(at, { kind: event.target.value as DateKind })}
              >
                <option value="to" disabled={used('to', at)}>
                  Before
                </option>
                <option value="from" disabled={used('from', at)}>
                  After
                </option>
              </select>
              <input
                type="date"
                aria-label={`${row.kind === 'from' ? 'After' : 'Before'} date`}
                value={row.date}
                onChange={(event) => update(at, { date: event.target.value })}
              />
              <button
                type="button"
                className={styles.trash}
                aria-label="Remove date filter"
                onClick={() => setRows((current) => current.filter((_, index) => index !== at))}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.chipIcon}>
                  <path d="M5 7h14 M10 7V5h4v2 M7 7l1 12h8l1-12 M10 11v5 M14 11v5" />
                </svg>
              </button>
            </div>
          ))}
          {rows.length < 2 && (
            <Button
              onClick={() =>
                setRows((current) => [
                  ...current,
                  { kind: current.some((row) => row.kind === 'to') ? 'from' : 'to', date: '' },
                ])
              }
            >
              Add date
            </Button>
          )}
        </div>
      </div>
      <DialogActions>
        <button
          type="button"
          className={styles.clearAll}
          disabled={count === 0}
          onClick={() => {
            setDraftOrigin('');
            setRows([]);
          }}
        >
          Clear filters{count > 0 ? ` (${count})` : ''}
        </button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={apply}>
          Apply filters
        </Button>
      </DialogActions>
    </Dialog>
  );
}

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
  const [more, setMore] = useState(false);
  // Focus handed back after a pick must not pop the list open again.
  const quiet = useRef(false);
  const closeMore = () => {
    setMore(false);
    requestAnimationFrame(() => {
      quiet.current = true;
      inputRef.current?.focus();
      quiet.current = false;
    });
  };
  const token = text.trim().toLowerCase();
  const rows = ROWS.filter(
    (row) => token === '' || (row.keyword !== '' && row.keyword.startsWith(token)),
  );

  const open = (next: Step, focus: boolean) => {
    setStep(next);
    setFocusFirst(focus);
  };
  const close = (refocus: boolean) => {
    setStep(null);
    if (refocus) {
      quiet.current = true;
      inputRef.current?.focus();
      quiet.current = false;
    }
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
                quiet.current = true;
                inputRef.current?.focus();
                quiet.current = false;
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
          onFocus={() => {
            if (!quiet.current && step === null) open('menu', false);
          }}
          onClick={() => {
            if (step === null) open('menu', false);
          }}
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
      {step !== null && !(step === 'menu' && rows.length === 0) && (
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
              <div className={styles.popoverTitle} aria-hidden="true">
                Filters
              </div>
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="menuitem"
                  className={styles.row}
                  onClick={() => {
                    if (row.id === 'more') {
                      setStep(null);
                      setMore(true);
                    } else open(row.id as Exclude<MenuRow, 'more'>, true);
                  }}
                >
                  <RowIcon name={row.id} />
                  <span className={styles.rowText}>
                    <span className={styles.rowTitle}>{row.title}</span>
                    <span className={styles.rowHint}>
                      {row.keyword !== '' && <b>{row.keyword}</b>} {row.hint}
                    </span>
                  </span>
                </button>
              ))}
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
                  quiet.current = true;
                  inputRef.current?.focus();
                  quiet.current = false;
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
      {more && (
        <MoreFilters
          origin={origin}
          from={from}
          to={to}
          onCancel={closeMore}
          onApply={(next) => {
            onOrigin(next.origin);
            onFrom(next.from);
            onTo(next.to);
            closeMore();
          }}
        />
      )}
    </div>
  );
}
