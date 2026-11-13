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

/** Temporary files this app creates in an exports folder. Nothing else may be swept. */
export const tempPartName = (exportId: string) => `.scrb-export-${exportId}.part`;
export const tempPrintName = (exportId: string) => `.scrb-print-${exportId}.html`;
const OUR_TEMP =
  /^\.scrb-(?:export-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part|print-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.html)$/;
export const isOurTempName = (name: string) => OUR_TEMP.test(name);
