/**
 * Rules for the hidden print window, kept free of Electron so tests can run them.
 * Only the one temporary page may load; every other URL, local or remote, is refused.
 */
export function allowPrintRequest(requestUrl: string, pageUrl: string): boolean {
  try {
    return new URL(requestUrl).href === new URL(pageUrl).href;
  } catch {
    return false;
  }
}

/** The page never navigates or opens windows after its first load. */
export function allowPrintNavigation(): boolean {
  return false;
}
