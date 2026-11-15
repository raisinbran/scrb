import type { ModelDownloadProgress } from '@scrb/contracts';

/** The Electron calls the restart needs, so a test can stand in for them. */
export interface RelaunchApp {
  relaunch(): void;
  quit(): void;
}

/** What can be running. Each part is absent when the app was started without it. */
export interface BusySources {
  recording?: { isBusy(): boolean } | null | undefined;
  finalPasses?: { hasWork(): boolean } | null | undefined;
  imports?: { list(): readonly unknown[] } | null | undefined;
}

/** True when nothing is recording, running a final pass or importing. */
export const isIdle = (sources: BusySources): boolean =>
  !(sources.recording?.isBusy() ?? false) &&
  !(sources.finalPasses?.hasWork() ?? false) &&
  (sources.imports?.list().length ?? 0) === 0;

/**
 * Restarts Scribe so the models that were just downloaded take effect, only when idle. `quit`,
 * not `exit`: the quit goes through the will-quit cleanup in quit.ts, which waits for the backend
 * to close for up to 15 seconds and then exits whether or not it has finished. Returns whether
 * a restart was requested.
 */
export function relaunchWhenIdle(app: RelaunchApp, idle: () => boolean): boolean {
  if (!idle()) return false;
  app.relaunch();
  app.quit();
  return true;
}

/**
 * The last file of a run has no bytes left in the run. Only that event carries the closing
 * message; it promises a restart only when one will happen (`restarting`).
 */
export function withReadyMessage(
  progress: ModelDownloadProgress,
  restarting: boolean,
): ModelDownloadProgress {
  const last =
    progress.state === 'done' &&
    progress.overallBytesDone !== undefined &&
    progress.overallBytesDone === progress.overallBytesTotal;
  if (!last) return progress;
  return {
    ...progress,
    message: restarting
      ? 'Models ready. Scribe is restarting.'
      : 'Models ready. Reopen Scribe to finish.',
  };
}
