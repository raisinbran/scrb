/** Pure trust checks (no Electron import) so tests run the same code the app does. */

/**
 * True only for a URL on the expected scheme, host and port with no credentials. `.origin` is
 * never used: Node reports "null" for every `scribe:` address, so it cannot tell them apart.
 */
export function isAppUrl(candidate: unknown, expected: URL): boolean {
  if (typeof candidate !== 'string') return false;
  try {
    const url = new URL(candidate);
    return (
      url.protocol === expected.protocol &&
      url.hostname === expected.hostname &&
      url.port === expected.port &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export interface TrustedSenderEvent {
  sender: { id: number; mainFrame: unknown };
  senderFrame?: { url: string } | null | undefined;
}

export interface AppTrust {
  appUrl: URL;
  /** `webContents.id` of every window Scribe created. */
  owned: ReadonlySet<number>;
}

/** An IPC sender is trusted only as the top frame of one of our own windows, on the app address. */
export function isTrustedSenderEvent(event: TrustedSenderEvent, trust: AppTrust): boolean {
  try {
    const frame = event.senderFrame;
    if (!frame || frame !== event.sender.mainFrame) return false;
    if (!trust.owned.has(event.sender.id)) return false;
    return isAppUrl(frame.url, trust.appUrl);
  } catch {
    return false;
  }
}
