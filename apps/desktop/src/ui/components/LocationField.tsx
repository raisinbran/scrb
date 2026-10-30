import { useId } from 'react';
import type { AppSettings } from '@scrb/contracts';
import { US_STATES, isListedState } from '../lib/us-states.ts';
import styles from './LocationField.module.css';

type Location = AppSettings['location'];

const OUTSIDE_US = 'outside';
const UNKNOWN_COUNTRY = 'ZZ';

/** The renderer's best view of the OS region, until the backend supplies the OS country. */
function osCountry(): string {
  const region = new Intl.Locale(navigator.language).region;
  return region && region !== 'US' ? region : UNKNOWN_COUNTRY;
}

function toLocation(choice: string): Location {
  if (choice === '') return { country: null, usState: null };
  if (choice === OUTSIDE_US) return { country: osCountry(), usState: null };
  return { country: 'US', usState: choice };
}

function fromLocation({ country, usState }: Location): string {
  if (country === null) return '';
  return country === 'US' ? (usState ?? '') : OUTSIDE_US;
}

export function LocationField({
  value,
  onChange,
}: {
  value: Location;
  onChange(location: Location): void;
}) {
  const noteId = useId();
  const stateName = US_STATES.find((state) => state.code === value.usState)?.name;
  const listed = value.country === 'US' && isListedState(value.usState);
  const outside = value.country !== null && value.country !== 'US';
  return (
    <div className={styles.field}>
      <label className={styles.label}>
        State where you live or most often work
        <select
          data-autofocus
          aria-describedby={noteId}
          value={fromLocation(value)}
          onChange={(event) => onChange(toLocation(event.target.value))}
        >
          <option value="">Choose…</option>
          {US_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.name}
            </option>
          ))}
          <option value={OUTSIDE_US}>Outside the United States</option>
        </select>
      </label>
      <div id={noteId}>
        {listed && (
          <p role="status" className={styles.warning}>
            {stateName} has a biometric-privacy law. Voice profiles are built from every voice in a
            recording, so a banner will show at the start of each one. Check whether you need
            people&apos;s consent.
          </p>
        )}
        {outside && (
          <p className={styles.note}>
            Meeting Scribe uses your computer&apos;s country setting to decide whether to show the
            privacy banner.
          </p>
        )}
      </div>
    </div>
  );
}
