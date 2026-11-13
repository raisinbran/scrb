export interface MiniInputs {
  status: 'idle' | 'recording' | 'paused' | 'stopping' | string;
  mainInFront: boolean;
  dismissed: boolean;
}

/** The mini window shows while a recording is on, the main window is not in front and it was not closed. */
export function shouldShowMini({ status, mainInFront, dismissed }: MiniInputs): boolean {
  return (status === 'recording' || status === 'paused') && !mainInFront && !dismissed;
}

export interface MiniHandle {
  close(): void;
  /** Cancels a close still fading out and shows the window again; false if it is already gone. */
  reopen?(): boolean;
}

/**
 * Opens and closes the mini window as the recording and the main window change. A close by the
 * user keeps it closed for that recording; the next recording starts afresh.
 */
export function createMiniController(openWindow: (onClosedByUser: () => void) => MiniHandle) {
  let status = 'idle';
  let mainInFront = true;
  let dismissed = false;
  let disposed = false;
  let handle: MiniHandle | null = null;
  // A window fading out. Showing again reuses it, so two mini windows never overlap.
  let closing: MiniHandle | null = null;

  const sync = (): void => {
    if (status === 'idle') dismissed = false;
    const want = !disposed && shouldShowMini({ status, mainInFront, dismissed });
    if (want && !handle) {
      if (closing?.reopen?.()) {
        handle = closing;
        closing = null;
        return;
      }
      const opened: MiniHandle = openWindow(() => {
        if (closing === opened) closing = null;
        if (handle !== opened) return;
        handle = null;
        dismissed = true;
      });
      handle = opened;
    } else if (!want && handle) {
      closing = handle;
      handle = null;
      closing.close();
    }
  };

  return {
    setStatus(next: string): void {
      status = next;
      sync();
    },
    setMainInFront(next: boolean): void {
      mainInFront = next;
      sync();
    },
    /** For quitting: nothing reopens after this. */
    dispose(): void {
      disposed = true;
      sync();
    },
  };
}

/** The app's own windows, without any mini one (one may still be fading out), which must never stand in for the main window. */
export function withoutMini<T>(windows: T[], minis: ReadonlySet<T>): T[] {
  return windows.filter((window) => !minis.has(window));
}

/** Brings the app back from the dock or a second launch: focus a main window, or make one if only the mini is left. */
export function restoreMain<T>(
  mainWindows: T[],
  focus: (window: T) => void,
  create: () => void,
): void {
  const [window] = mainWindows;
  if (window === undefined) create();
  else focus(window);
}

/** The fixed address the mini window's "Show Scribe" button opens; the UI keeps a copy of this string. */
export const SHOW_MAIN_URL = 'scrb-app://show-main';

/**
 * The mini window's only window-open rule: the exact show-main address brings the app back, and
 * every open is still denied. Apply it to the mini window's contents alone.
 */
export function miniWindowOpenHandler(showMain: () => void): (details: { url: string }) => {
  action: 'deny';
} {
  return ({ url }) => {
    if (url === SHOW_MAIN_URL) showMain();
    return { action: 'deny' };
  };
}

/**
 * Fixed window options. It cannot be minimized: on macOS the key window going to the dock hands
 * the keyboard to the next window of the app and raises it, so minimizing the mini window brought
 * the main window to the front. Closing it is the way to dismiss it.
 */
export const MINI_WINDOW_OPTIONS = {
  title: 'Scribe recording',
  width: 264,
  height: 72,
  // The size is the page area, so the title bar never takes from the two rows.
  useContentSize: true,
  alwaysOnTop: true,
  resizable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  autoHideMenuBar: true,
  show: false,
} as const;
