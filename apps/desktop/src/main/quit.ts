const CLOSE_LIMIT_MS = 15_000;

export interface QuitActivity {
  recording: boolean;
  finalPass: boolean;
  importing: boolean;
  recovering: boolean;
}

interface CancelableEvent {
  preventDefault(): void;
}

export interface SafeQuitOptions {
  activity(): QuitActivity;
  confirm(activity: QuitActivity): Promise<boolean>;
  quit(): void;
}

const isBusy = (activity: QuitActivity): boolean =>
  activity.recording || activity.finalPass || activity.importing || activity.recovering;

const sameActivity = (first: QuitActivity, second: QuitActivity): boolean =>
  first.recording === second.recording &&
  first.finalPass === second.finalPass &&
  first.importing === second.importing &&
  first.recovering === second.recovering;

export const shouldGuardLastMainWindowClose = (
  platform: string,
  isLastMainWindow: boolean,
): boolean => platform === 'win32' && isLastMainWindow;

/**
 * Vetoes destructive quit paths while main-process recording or processing is active. A confirmed
 * quit re-enters Electron's normal quit lifecycle so will-quit cleanup and recording sealing run.
 */
export function createSafeQuitGuard(options: SafeQuitOptions) {
  let quitApproved = false;
  let promptOpen = false;

  const approveQuit = (onApproved?: () => void): void => {
    quitApproved = true;
    promptOpen = false;
    try {
      onApproved?.();
    } catch {
      quitApproved = false;
      return;
    }
    options.quit();
  };

  const askToQuit = (initialActivity: QuitActivity, onApproved?: () => void): void => {
    if (promptOpen) return;
    promptOpen = true;
    void (async () => {
      let shownActivity = initialActivity;
      while (true) {
        let confirmed: boolean;
        try {
          confirmed = await options.confirm(shownActivity);
        } catch {
          // Dialog failure keeps the app open; it must never approve a destructive quit.
          return;
        }
        if (!confirmed) return;

        const currentActivity = options.activity();
        if (!isBusy(currentActivity) || sameActivity(shownActivity, currentActivity)) {
          approveQuit(onApproved);
          return;
        }

        // Critical work changed while the dialog was open. Ask against the new snapshot.
        shownActivity = currentActivity;
      }
    })().finally(() => {
      promptOpen = false;
    });
  };

  return {
    /** Request a quit action such as recovery restart through the same consent gate. */
    requestQuit(onApproved?: () => void): void {
      if (promptOpen) return;
      const activity = options.activity();
      if (isBusy(activity)) {
        askToQuit(activity, onApproved);
      } else {
        approveQuit(onApproved);
      }
    },

    /** Return true only when the caller may perform pre-quit cleanup. */
    beforeQuit(event: CancelableEvent): boolean {
      if (quitApproved) return true;
      if (promptOpen) {
        event.preventDefault();
        return false;
      }
      const activity = options.activity();
      if (!isBusy(activity)) {
        quitApproved = true;
        return true;
      }
      event.preventDefault();
      askToQuit(activity);
      return false;
    },

    /**
     * Windows quits when its last main window closes. Hold that close until the app-level guard
     * decides; this keeps the main window alive if quit is canceled or activity changes.
     */
    lastMainWindowClose(event: CancelableEvent): void {
      if (quitApproved) return;
      event.preventDefault();
      if (promptOpen) return;
      const activity = options.activity();
      if (isBusy(activity)) {
        askToQuit(activity);
      } else {
        // beforeQuit rechecks activity before allowing windows or mini-window cleanup to proceed.
        options.quit();
      }
    },
  };
}

interface QuittingApp {
  on(event: 'will-quit', listener: (event: { preventDefault(): void }) => void): unknown;
  exit(code: number): void;
}

/** Electron does not wait for async work in will-quit, so the quit is held until close ends. */
export function closeBeforeQuit(
  app: QuittingApp,
  close: () => Promise<void>,
  limitMs = CLOSE_LIMIT_MS,
): void {
  let closing = false;
  app.on('will-quit', (event) => {
    event.preventDefault();
    if (closing) return;
    closing = true;
    let limit: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<void>((resolve) => {
      limit = setTimeout(resolve, limitMs);
    });
    void Promise.race([close(), timedOut])
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(limit);
        app.exit(0);
      });
  });
}
