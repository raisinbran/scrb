import { BrowserWindow, session } from 'electron';
import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PdfPrintOptions } from '@scrb/export';
import { allowPrintNavigation, allowPrintRequest, tempPrintName } from './print-guard.ts';
import { printWebPreferences } from './web-preferences.ts';

export interface PrintJob {
  html: string;
  options: PdfPrintOptions;
  /** The meeting's exports folder; the temporary page lives here and is deleted afterwards. */
  folder: string;
  exportId: string;
  /** Sees every request the print session decides on; used by the real-Electron security test. */
  onRequest?: (url: string, allowed: boolean) => void;
}

export type PrintJobRunner = (job: PrintJob) => Promise<Uint8Array>;

const PRINT_TIMEOUT_MS = 60_000;

/**
 * Prints through a hidden window on its own in-memory session. That session refuses every
 * request except the one page, so the transcript cannot leave the machine and no other local
 * file can be read into the PDF.
 */
export const printHtmlToPdf: PrintJobRunner = async ({
  html,
  options,
  folder,
  exportId,
  onRequest,
}) => {
  const file = path.join(folder, tempPrintName(exportId));
  let win: BrowserWindow | null = null;
  let timer: NodeJS.Timeout | undefined;
  try {
    await writeFile(file, html, 'utf8');
    const pageUrl = pathToFileURL(file).toString();
    const ses = session.fromPartition(`print-${exportId}`);
    ses.webRequest.onBeforeRequest((details, callback) => {
      const allowed = allowPrintRequest(details.url, pageUrl);
      onRequest?.(details.url, allowed);
      callback({ cancel: !allowed });
    });
    ses.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    win = new BrowserWindow({
      show: false,
      webPreferences: { ...printWebPreferences(), session: ses },
    });
    if (win.webContents.session !== ses) throw new Error('print window is not on its own session');
    const contents = win.webContents;
    contents.on('will-navigate', (event) => {
      if (!allowPrintNavigation()) event.preventDefault();
    });
    contents.on('will-redirect', (event) => {
      if (!allowPrintNavigation()) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('print timed out')), PRINT_TIMEOUT_MS);
    });
    const printing = (async () => {
      await contents.loadURL(pageUrl);
      return new Uint8Array(await contents.printToPDF(options));
    })();
    printing.catch(() => undefined);
    return await Promise.race([printing, timeout]);
  } finally {
    clearTimeout(timer);
    win?.destroy();
    await rm(file, { force: true }).catch(() => undefined);
  }
};
