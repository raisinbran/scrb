import { useState } from 'react';
import type { AppSettings, Backend } from '@scrb/contracts';
import { useBackend } from '../lib/backend-context.tsx';
import { useAction } from '../lib/use-action.ts';
import { useBackendData } from '../lib/use-backend-data.ts';
import { Button } from './Button.tsx';
import { Dialog, DialogActions } from './Dialog.tsx';
import { LocationField } from './LocationField.tsx';
import styles from './FirstLaunchLocation.module.css';

const load = (backend: Backend) => backend.call('getSetupStatus');

/** The required first-launch question. It has no dismiss, so the app waits for an answer. */
export function FirstLaunchLocation({ onAnswered }: { onAnswered(): void }) {
  const backend = useBackend();
  const { state } = useBackendData(load);
  const [location, setLocation] = useState<AppSettings['location']>({
    country: null,
    usState: null,
  });
  const [answered, setAnswered] = useState(false);
  const { busy, error, run } = useAction();

  if (state.status !== 'ready' || state.data.locationSet || answered) return null;

  const save = () =>
    void run(async () => {
      await backend.call('updateSettings', { location });
      setAnswered(true);
      onAnswered();
    });

  return (
    <Dialog title="Where are you based?">
      <p className={styles.intro}>
        Some places have laws about voice data. Meeting Scribe builds voice profiles, and this
        answer decides whether a privacy banner shows when you record. It stays on this computer,
        and you can change it later in Settings.
      </p>
      <LocationField value={location} onChange={setLocation} />
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <DialogActions>
        <Button variant="primary" disabled={busy || location.country === null} onClick={save}>
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );
}
