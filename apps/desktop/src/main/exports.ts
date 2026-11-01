import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BrowserWindow } from 'electron';
import { toExportMeeting } from '@scrb/app-core';
import { atomicWriteFile, MeetingNotFoundError, StorageError, type Library } from '@scrb/storage';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type ExportRequest,
} from '@scrb/contracts';
import {
  buildExportDocument,
  renderDocx,
  renderPdf,
  ExportInputError,
} from '../../../../packages/export/src/index.ts';
import type { PrintHtmlToPdf } from '../../../../packages/export/src/render-pdf.ts';
import type { CallHandlers } from './dispatch.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

/**
 * Prints from a file in the app's cache, not a data URL: Chromium refuses URLs over 2 MB, which a
 * long transcript exceeds. The page has scripts off and is deleted after printing.
 */
export function createPrintPdf(cacheDir: string): PrintHtmlToPdf {
  return async (html, options) => {
    const page = join(cacheDir, `${randomUUID()}.html`);
    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        javascript: false,
      },
    });
    try {
      await mkdir(cacheDir, { recursive: true });
      await writeFile(page, html, 'utf8');
      await window.loadFile(page);
      return await window.webContents.printToPDF(options);
    } finally {
      window.destroy();
      await rm(page, { force: true }).catch(() => undefined);
    }
  };
}

export class ExportCoordinator {
  private readonly running = new Map<string, Promise<void>>();

  constructor(
    private readonly library: Library,
    private readonly emit: Emit,
    private readonly print: PrintHtmlToPdf,
  ) {}

  private async export(input: ExportRequest): Promise<{ exportId: string }> {
    if (this.running.has(input.meetingId)) {
      throw new ContractError({ code: 'conflict', message: 'An export is already in progress.' });
    }
    const snapshot = await this.snapshot(input.meetingId);
    const exportId = randomUUID();
    // Deferred, because a run that fails before its first await would finish before it is tracked.
    const job = Promise.resolve().then(() => this.run(input, exportId, snapshot));
    this.running.set(input.meetingId, job);
    return { exportId };
  }

  private async snapshot(meetingId: string): ReturnType<Library['beginExport']> {
    try {
      return await this.library.beginExport(meetingId);
    } catch (error) {
      if (error instanceof MeetingNotFoundError) {
        throw new ContractError({ code: 'notFound', message: 'That meeting no longer exists.' });
      }
      if (error instanceof StorageError && error.code === 'ACTIVE_MEETING') {
        throw new ContractError({ code: 'conflict', message: error.message });
      }
      throw error;
    }
  }

  private async run(
    input: ExportRequest,
    exportId: string,
    snapshot: Awaited<ReturnType<Library['beginExport']>>,
  ): Promise<void> {
    try {
      const data = toExportMeeting(snapshot.meeting, snapshot.transcript, snapshot.summary);
      const document = buildExportDocument(data, {
        scope: input.content,
        transcript: input.transcript,
        summary: input.summary,
      });
      const bytes =
        input.format === 'docx'
          ? await renderDocx(document)
          : await renderPdf(document, this.print);
      const fileName = `meeting-${exportId}.${input.format}`;
      await atomicWriteFile(
        join(this.library.meetingPaths(input.meetingId).exports, fileName),
        bytes,
      );
      this.emit('exportFinished', { exportId, meetingId: input.meetingId, ok: true, fileName });
    } catch (error) {
      this.emit('exportFinished', {
        exportId,
        meetingId: input.meetingId,
        ok: false,
        message:
          error instanceof ExportInputError
            ? error.message
            : 'Could not export the meeting. Its original files are unchanged.',
      });
    } finally {
      snapshot.release();
      this.running.delete(input.meetingId);
    }
  }

  get handlers(): CallHandlers {
    return { exportMeeting: (input) => this.export(input as ExportRequest) };
  }

  async shutdown(): Promise<void> {
    await Promise.all(this.running.values());
  }
}
