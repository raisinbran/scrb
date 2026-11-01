import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { BrowserWindow } from 'electron';
import { toExportMeeting } from '@scrb/app-core';
import { atomicWriteFile, type Library } from '@scrb/storage';
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

/** Load large generated HTML from a private file; Chromium limits data: URL length. */
export const printPdf: PrintHtmlToPdf = async (html, options) => {
  const temporaryDir = await mkdtemp(join(tmpdir(), 'scrb-pdf-'));
  const file = join(temporaryDir, 'document.html');
  let window: BrowserWindow | null = null;
  try {
    await writeFile(file, html, { encoding: 'utf8', mode: 0o600 });
    window = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      javascript: false,
    },
  });
    await window.loadFile(file);
    return await window.webContents.printToPDF(options);
  } finally {
    window?.destroy();
    await rm(temporaryDir, { recursive: true, force: true });
  }
};

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
    const snapshot = await this.library.beginExport(input.meetingId);
    const exportId = randomUUID();
    const job = this.run(input, exportId, snapshot);
    this.running.set(input.meetingId, job);
    return { exportId };
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
