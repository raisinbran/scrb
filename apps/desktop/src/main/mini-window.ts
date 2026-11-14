export interface MiniInputs {
  /** The user hid the mini window with its Hide button. */
  hidden?: boolean;
  /** The user asked for it back: it shows even with the main window in front. */
  forced?: boolean;
  status: 'idle' | 'recording' | 'paused' | 'stopping' | string;
  mainInFront: boolean;
  dismissed: boolean;
}

/** The mini window shows while a recording is on, the main window is not in front and it was not closed. */
export function shouldShowMini({
  status,
  mainInFront,
  dismissed,
  hidden = false,
  forced = false,
}: MiniInputs): boolean {
  return (
    (status === 'recording' || status === 'paused') &&
    !dismissed &&
    !hidden &&
    (forced || !mainInFront)
  );
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
export function createMiniController(
  openWindow: (onClosedByUser: () => void) => MiniHandle,
  onHiddenChanged: (hidden: boolean) => void = () => undefined,
) {
  let status = 'idle';
  let mainInFront = true;
  let dismissed = false;
  let hidden = false;
  let forced = false;
  let disposed = false;
  let handle: MiniHandle | null = null;
  // A window fading out. Showing again reuses it, so two mini windows never overlap.
  let closing: MiniHandle | null = null;

  const setHidden = (next: boolean): void => {
    if (hidden === next) return;
    hidden = next;
    onHiddenChanged(next);
  };

  const sync = (): void => {
    if (status === 'idle') {
      dismissed = false;
      setHidden(false);
      forced = false;
    }
    const want = !disposed && shouldShowMini({ status, mainInFront, dismissed, hidden, forced });
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
    /** The Hide button: the window goes away, and a recording goes on. */
    hide(): void {
      forced = false;
      setHidden(true);
      sync();
    },
    /** The way back from the main window: it shows even while the main window is in front. */
    show(): void {
      setHidden(false);
      forced = true;
      sync();
    },
    /** With no main window left there is no way back, so a hidden mini window returns. */
    mainGone(): void {
      setHidden(false);
      forced = false;
      sync();
    },
    setMainInFront(next: boolean): void {
      // Back in the main window: a window it asked for earlier has done its job.
      if (next && !mainInFront) forced = false;
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

/** Addresses the mini window's buttons open; the UI keeps a copy of these strings. */
export const COMPACT_URL = 'scrb-app://mini-compact';
export const EXPAND_URL = 'scrb-app://mini-expand';
export const HIDE_URL = 'scrb-app://mini-hide';

/**
 * The mini window's only window-open rules: three exact addresses (show the app, make the window
 * compact, make it full size), and every open is still denied. Apply it to the mini window's
 * contents alone.
 */
export function miniWindowOpenHandler(
  showMain: () => void,
  setCompact: (compact: boolean) => void,
  hide: () => void,
): (details: { url: string }) => { action: 'deny' } {
  return ({ url }) => {
    if (url === SHOW_MAIN_URL) showMain();
    else if (url === COMPACT_URL) setCompact(true);
    else if (url === EXPAND_URL) setCompact(false);
    else if (url === HIDE_URL) hide();
    return { action: 'deny' };
  };
}

/**
 * Fixed window options. The OS minimize is off: on macOS, minimizing the key window can hand the
 * keyboard to the app's next window and raise it, and that could not be verified or fixed (see the
 * PR). The compact button shrinks the window to its status row instead and touches no other window.
 */
export const MINI_WINDOW_SIZE = { width: 320, height: 72 } as const;
/** Content height of the compact strip: the status row only. */
export const MINI_COMPACT_HEIGHT = 40;

export const MINI_WINDOW_OPTIONS = {
  title: 'Scribe recording',
  ...MINI_WINDOW_SIZE,
  // The size is the page area, so the title bar never takes from the two rows.
  useContentSize: true,
  alwaysOnTop: true,
  resizable: false,
  minimizable: false,
  // Only the app closes it (when the recording ends or the app quits); see `createCloseGate`.
  closable: false,
  maximizable: false,
  fullscreenable: false,
  autoHideMenuBar: true,
  show: false,
} as const;

/**
 * The mini window cannot be closed by the user: the OS close control is off, and any close that
 * still arrives (Cmd+W, a menu, the keyboard) is cancelled unless the app opened the gate first
 * (the recording ended, the main window went away, or the app is quitting).
 */
export function createCloseGate() {
  let open = false;
  return {
    allow(): void {
      open = true;
    },
    /** True when a close event must be cancelled. */
    blocks: (): boolean => !open,
  };
}
