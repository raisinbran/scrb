const CLOSE_LIMIT_MS = 15_000;

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
