import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { BrowserWindow } from 'electron';
import { toExportMeeting } from '@scrb/app-core';
import { atomicWriteFile, meetingFolderName, StorageError, type Library } from '@scrb/storage';
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

const PDF_SCRATCH = /^scrb-pdf-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** Called at library startup, before exports begin; never remove unowned names or symlinks. */
export async function cleanupOrphanPdfPrints(cacheDir: string): Promise<void> {
  const entries = await readdir(cacheDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !PDF_SCRATCH.test(entry.name)) continue;
    await rm(join(cacheDir, entry.name), { recursive: true, force: true });
  }
}

/** Load large generated HTML from a private file in the library cache, not an OS temp folder. */
export async function printPdf(
  html: string,
  options: Parameters<PrintHtmlToPdf>[1],
  cacheDir: string,
): Promise<Uint8Array> {
  const temporaryDir = join(cacheDir, `scrb-pdf-${randomUUID()}`);
  await mkdir(temporaryDir, { mode: 0o700 });
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
    let snapshot: Awaited<ReturnType<Library['beginExport']>>;
    try {
      snapshot = await this.library.beginExport(input.meetingId);
    } catch (error) {
      if (error instanceof StorageError && error.code === 'ACTIVE_MEETING') {
        throw new ContractError({ code: 'conflict', message: 'The meeting is busy.' });
      }
      if (error instanceof StorageError && error.code === 'MEETING_NOT_FOUND') {
        throw new ContractError({ code: 'notFound', message: 'Meeting not found.' });
      }
      throw error;
    }
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
      const fileName = `${meetingFolderName(snapshot.meeting.date, snapshot.meeting.title)}-${exportId}.${input.format}`;
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
