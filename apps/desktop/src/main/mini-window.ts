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

  const sync = (): void => {
    if (status === 'idle') dismissed = false;
    const want = !disposed && shouldShowMini({ status, mainInFront, dismissed });
    if (want && !handle) {
      const opened: MiniHandle = openWindow(() => {
        if (handle !== opened) return;
        handle = null;
        dismissed = true;
      });
      handle = opened;
    } else if (!want && handle) {
      const closing = handle;
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

/** The app's own windows, without the mini one, which must never stand in for the main window. */
export function withoutMini<T>(windows: T[], mini: T | null): T[] {
  return windows.filter((window) => window !== mini);
}
