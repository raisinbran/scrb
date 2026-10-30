export type ScriptStep =
  | { kind: 'pause' }
  | { kind: 'resume' }
  | { kind: 'deviceChange' }
  | { kind: 'lagSpike'; lagMs: number }
  | { kind: 'lagClear' };

/** Second of the scripted meeting at which each scene happens. Text arrives every second. */
export const SCRIPT: ReadonlyArray<{ atSecond: number; step: ScriptStep }> = [
  { atSecond: 15, step: { kind: 'pause' } },
  { atSecond: 20, step: { kind: 'resume' } },
  { atSecond: 35, step: { kind: 'deviceChange' } },
  { atSecond: 50, step: { kind: 'lagSpike', lagMs: 11_000 } },
  { atSecond: 62, step: { kind: 'lagClear' } },
];
