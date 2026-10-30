import { useEffect, useState } from 'react';
import type { AudioCheckStatus, SourceSelection } from '@scrb/contracts';
import { useBackend } from '../../lib/backend-context.tsx';
import styles from '../LiveScreen.module.css';

const MIC_RESULT: Record<AudioCheckStatus['micResult'], string> = {
  listening: 'Listening…',
  hearing: 'We can hear you',
  quiet: 'Very quiet',
  noSignal: 'No sound from this mic',
  denied: 'Mic permission is off',
};

export function MicTest({ sources }: { sources: SourceSelection | null }) {
  const backend = useBackend();
  const [check, setCheck] = useState<AudioCheckStatus | null>(null);

  useEffect(() => {
    const unsubscribe = backend.on('audioCheck', setCheck);
    return () => {
      unsubscribe();
      void backend.call('stopAudioCheck').catch(() => undefined);
    };
  }, [backend]);

  const active = check?.active === true;
  const toggle = () => {
    if (active) void backend.call('stopAudioCheck');
    else if (sources) void backend.call('startAudioCheck', { sources }).catch(() => undefined);
  };

  return (
    <div className={styles.controls}>
      <button type="button" className={styles.button} disabled={!sources} onClick={toggle}>
        {active ? 'Stop test' : 'Test mic'}
      </button>
      {active && check && (
        <span className={styles.hint} role="status">
          {MIC_RESULT[check.micResult]}
          {check.micDevice?.transport === 'bluetoothHandsFree' &&
            '. This headset is in call mode, so sound quality is lower.'}
        </span>
      )}
    </div>
  );
}
