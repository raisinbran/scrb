import { useId, useState } from 'react';
import type { AppSettings } from '@scrb/contracts';
import { US_STATES, isListedState } from '../lib/us-states.ts';
import { SearchSelect, type SearchOption } from './SearchSelect.tsx';
import styles from './LocationField.module.css';

type Location = AppSettings['location'];

/** Saved when someone picks a country Scribe does not list: the computer's own setting is used. */
const USE_OS_COUNTRY = 'ZZ';
const NOT_COUNTRIES = new Set([
  'AC',
  'CP',
  'DG',
  'EA',
  'EU',
  'EZ',
  'IC',
  'QO',
  'TA',
  'UN',
  'XA',
  'XB',
  'ZZ',
]);

function countryOptions(): SearchOption[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const options: SearchOption[] = [];
  for (let a = 65; a <= 90; a += 1) {
    for (let b = 65; b <= 90; b += 1) {
      const code = String.fromCharCode(a, b);
      const name = NOT_COUNTRIES.has(code) ? undefined : names.of(code);
      if (name) options.push({ value: code, label: name });
    }
  }
  options.sort((x, y) => x.label.localeCompare(y.label));
  return [...options, { value: USE_OS_COUNTRY, label: "Not listed (use this computer's country)" }];
}

const COUNTRIES = countryOptions();

const STATE_OPTIONS: SearchOption[] = US_STATES.map((state) => ({
  value: state.code,
  label: state.name,
}));

/**
 * Country, then a state for the United States only. Both controls and the note area keep one size
 * and place at all times, so choosing a country never moves anything below it.
 */
export function LocationField({
  value,
  onChange,
}: {
  value: Location;
  onChange(location: Location): void;
}) {
  const noteId = useId();
  // The United States is held here until a state is chosen, so a half answer is never saved.
  const [pendingUS, setPendingUS] = useState(false);
  const country = pendingUS ? 'US' : (value.country ?? '');
  const stateName = US_STATES.find((state) => state.code === value.usState)?.name;
  const listed = country === 'US' && !pendingUS && isListedState(value.usState);
  const outside = country !== '' && country !== 'US';
  return (
    <div className={styles.field}>
      <div className={styles.label}>
        Country where you live or most often work
        <SearchSelect
          label="Country"
          placeholder="Choose…"
          options={COUNTRIES}
          value={country}
          autoFocus
          describedBy={noteId}
          onChange={(code) => {
            if (code === 'US') {
              if (value.country !== 'US') setPendingUS(true);
              return;
            }
            setPendingUS(false);
            onChange({ country: code, usState: null });
          }}
        />
      </div>
      <div className={styles.label}>
        State
        <SearchSelect
          label="State"
          placeholder={country === 'US' ? 'Choose…' : 'Only for the United States'}
          options={STATE_OPTIONS}
          value={pendingUS ? '' : (value.usState ?? '')}
          disabled={country !== 'US'}
          describedBy={noteId}
          onChange={(code) => {
            setPendingUS(false);
            onChange({ country: 'US', usState: code });
          }}
        />
      </div>
      <div id={noteId} className={styles.notes}>
        {listed && (
          <p role="status" className={styles.warning}>
            {stateName} has a biometric-privacy law. Voice profiles are built from every voice in a
            recording, so a banner will show at the start of each one. Check whether you need
            people&apos;s consent.
          </p>
        )}
        {outside && (
          <p className={styles.note}>
            Scribe uses your computer&apos;s country setting to decide whether to show the privacy
            banner.
          </p>
        )}
      </div>
    </div>
  );
}
