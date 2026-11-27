import { useSyncExternalStore } from 'react';
import type { Backend, FinalPassProgress, FinalPassStage } from '@scrb/contracts';
import { useBackend } from './backend-context.tsx';

const STAGE_ORDER: FinalPassStage[] = ['queued', 'transcribing', 'diarizing', 'finishing'];

/** Reports can arrive late or out of order; one that goes backwards within a pass is ignored. A later `startedAt` is a new pass; an earlier one is a late report from an old pass. */
export function nextProgress(
  current: FinalPassProgress | null,
  report: FinalPassProgress,
): FinalPassProgress | null {
  if (!current) return report;
  const started = Date.parse(report.startedAt);
  const currentStarted = Date.parse(current.startedAt);
  if (started > currentStarted) return report;
  if (started < currentStarted) return current;
  const earlier = STAGE_ORDER.indexOf(report.stage) < STAGE_ORDER.indexOf(current.stage);
  return earlier || report.fraction < current.fraction ? current : report;
}

/** The latest final-pass report per meeting, kept for the life of the app so a row or banner that mounts mid-pass starts from it. */
class ProgressStore {
  private readonly latest = new Map<string, FinalPassProgress>();
  private readonly listeners = new Set<() => void>();

  constructor(backend: Backend) {
    backend.on('finalPassProgress', (report) => {
      const before = this.latest.get(report.meetingId) ?? null;
      const after = nextProgress(before, report);
      if (after && after !== before) {
        this.latest.set(report.meetingId, after);
        this.notify();
      }
    });
    // A pass that ended another way (failed, cancelled, ready) must not leave its last value for the next one.
    backend.on('meetingChanged', ({ id, status }) => {
      if (status !== 'finalPassRunning' && this.latest.delete(id)) this.notify();
    });
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  /** A finished pass reads as no report, so a re-run waiting to start shows an empty bar, never 100%. */
  get(meetingId: string): FinalPassProgress | null {
    const report = this.latest.get(meetingId);
    return report && !(report.stage === 'finishing' && report.fraction >= 1) ? report : null;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

const stores = new WeakMap<Backend, ProgressStore>();

/** Starts listening on this backend; call once at app start so no report is missed. */
export function startFinalPassProgress(backend: Backend): void {
  if (!stores.has(backend)) stores.set(backend, new ProgressStore(backend));
}

/** The latest report for a meeting, or null before the first one. */
export function useFinalPassProgress(meetingId: string): FinalPassProgress | null {
  const backend = useBackend();
  startFinalPassProgress(backend);
  const store = stores.get(backend) as ProgressStore;
  return useSyncExternalStore(store.subscribe, () => store.get(meetingId));
}
