import { useEffect, useRef } from 'react';
import { useBackend } from '../../lib/backend-context.tsx';
import styles from '../LiveScreen.module.css';

const FLOOR_DB = -60;

function fractionOf(db: number): number {
  return Math.min(Math.max((db - FLOOR_DB) / -FLOOR_DB, 0), 1);
}

/** Levels arrive many times a second, so they go straight to the DOM and skip React rendering. */
function setLevel(element: HTMLElement | null, db: number): void {
  if (!element) return;
  element.style.setProperty('--level', String(fractionOf(db)));
  element.setAttribute('aria-valuenow', String(Math.round(db)));
}

function Meter({ label, meterRef }: { label: string; meterRef: React.Ref<HTMLDivElement> }) {
  return (
    <div className={styles.meterRow}>
      <span className={styles.meterLabel}>{label}</span>
      <div
        ref={meterRef}
        className={styles.meter}
        role="meter"
        aria-label={`${label} level`}
        aria-valuemin={-100}
        aria-valuemax={0}
        aria-valuenow={-100}
        aria-valuetext={undefined}
      >
        <div className={styles.meterFill} />
      </div>
    </div>
  );
}

export function LevelMeters({ active }: { active: boolean }) {
  const backend = useBackend();
  const micRef = useRef<HTMLDivElement>(null);
  const meetingRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      backend.on('levelMeter', ({ micDb, meetingDb }) => {
        setLevel(micRef.current, micDb);
        setLevel(meetingRef.current, meetingDb);
      }),
    [backend],
  );

  useEffect(() => {
    if (active) return;
    setLevel(micRef.current, -100);
    setLevel(meetingRef.current, -100);
  }, [active]);

  return (
    <div className={styles.meters}>
      <Meter label="Mic" meterRef={micRef} />
      <Meter label="Meeting" meterRef={meetingRef} />
    </div>
  );
}
