import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { toExportMeeting } from '@scrb/app-core';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type ExportRequest as ContractExportRequest,
} from '@scrb/contracts';
import { buildExportDocument, renderPdf, renderVtt, type ExportMeeting } from '@scrb/export';
import { errorFields, resolveDisplay, type Library, type MeetingMeta } from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';
import type { DocxRenderer } from './export-worker.ts';
import type { PrintJobRunner } from './export-print.ts';
import { isOurTempName, tempPartName } from './print-guard.ts';
import { requireMeeting, timelineGaps } from './meetings.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

const EXPORTABLE = new Set<MeetingMeta['status']>(['ready', 'recovered', 'finalPassRunning']);
const STALE_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE = 60;

/** A title is only a label: strip anything a file system treats as a separator or control. */
export function exportFileStem(title: string, date: string): string {
  const cleaned = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE)
    .replace(/^[.\s]+|[.\s]+$/g, '');
  const day = /^\d{4}-\d{2}-\d{2}/.exec(date)?.[0] ?? new Date().toISOString().slice(0, 10);
  return `${cleaned || 'transcript'}-${day}`;
}

function failureMessage(error: unknown): string {
  const code = (error as { code?: unknown })?.code;
  if (code === 'ENOSPC') return 'Not enough disk space.';
  if (error instanceof PdfFailure) return 'The PDF could not be created. Try DOCX.';
  return 'The export failed.';
}

class PdfFailure extends Error {}

/** Best effort: leftovers from an app quit mid-export, older than a day. */
async function sweepStale(folder: string): Promise<void> {
  try {
    for (const name of await readdir(folder)) {
      if (!isOurTempName(name)) continue;
      const file = path.join(folder, name);
      // lstat: a symlink with our name is not ours to follow or delete.
      const info = await lstat(file);
      if (info.isFile() && Date.now() - info.mtimeMs > STALE_MS) await rm(file, { force: true });
    }
  } catch {
    // Nothing to sweep.
  }
}

/** Claims a free name, then moves the finished bytes over it, so nothing is ever overwritten. */
async function writeUnique(
  folder: string,
  stem: string,
  extension: string,
  bytes: Uint8Array,
  exportId: string,
): Promise<string> {
  const part = path.join(folder, tempPartName(exportId));
  try {
    await writeFile(part, bytes, { flag: 'wx' });
    for (let n = 1; ; n += 1) {
      const fileName = `${n === 1 ? stem : `${stem} (${n})`}.${extension}`;
      const target = path.join(folder, fileName);
      try {
        await (await open(target, 'wx')).close();
      } catch (error) {
        if ((error as { code?: unknown }).code === 'EEXIST') continue;
        throw error;
      }
      try {
        await rename(part, target);
      } catch (error) {
        await rm(target, { force: true });
        throw error;
      }
      return fileName;
    }
  } finally {
    await rm(part, { force: true }).catch(() => undefined);
  }
}

export interface ExportDeps {
  library: Library;
  emit: Emit;
  print: PrintJobRunner;
  renderDocx: DocxRenderer;
}

/** Real transcript export: DOCX from a worker thread, PDF through the hidden print window, WebVTT as text. */
export function createExportHandlers(deps: ExportDeps): CallHandlers {
  const { library, emit } = deps;

  const toMeeting = async (meeting: MeetingMeta): Promise<ExportMeeting> => {
    const transcript = await library.readTranscript(meeting.id);
    const words = resolveDisplay(transcript).reduce((sum, s) => sum + s.tokens.length, 0);
    if (words === 0) {
      throw new ContractError({
        code: 'conflict',
        message: 'This meeting has no transcript to export yet.',
      });
    }
    const base = toExportMeeting(meeting, transcript, null);
    return {
      ...base,
      // Two tracks are stored one after the other; a reader expects time order.
      segments: [...base.segments].sort((a, b) => a.startMs - b.startMs),
      markers: [
        ...timelineGaps(library, meeting).map((gap) => ({
          kind: gap.kind === 'paused' ? ('pause' as const) : ('gap' as const),
          startMs: gap.startMs,
          endMs: gap.endMs,
        })),
        ...(meeting.status === 'recovered'
          ? [{ kind: 'recording-ended' as const, startMs: meeting.durationMs }]
          : []),
      ],
    };
  };

  const run = async (
    exportId: string,
    meeting: MeetingMeta,
    data: ExportMeeting,
    request: ContractExportRequest,
  ): Promise<string> => {
    const folder = library.meetingPaths(meeting.id).exports;
    await mkdir(folder, { recursive: true });
    const [root, actual] = await Promise.all([realpath(library.paths.root), realpath(folder)]);
    if (!actual.startsWith(root + path.sep)) throw new Error('exports folder outside library');
    await sweepStale(actual);
    const options = { scope: 'transcript' as const, transcript: request.transcript };
    let bytes: Uint8Array;
    if (request.format === 'docx') {
      bytes = await deps.renderDocx({ meeting: data, request: options, pageSize: 'Letter' });
    } else if (request.format === 'vtt') {
      bytes = new TextEncoder().encode(
        renderVtt(data, { speakerNames: request.transcript.speakerNames }),
      );
    } else {
      try {
        bytes = await renderPdf(
          buildExportDocument(data, options),
          (html, printOptions) =>
            deps.print({ html, options: printOptions, folder: actual, exportId }),
          { pageSize: 'Letter' },
        );
      } catch (error) {
        library.logger.log('error', 'export-pdf-failed', errorFields(error));
        throw new PdfFailure();
      }
    }
    return writeUnique(
      actual,
      exportFileStem(meeting.title, meeting.date),
      request.format,
      bytes,
      exportId,
    );
  };

  return {
    exportMeeting: async (raw) => {
      const request = raw as ContractExportRequest;
      const meeting = await requireMeeting(library, request.meetingId);
      if (request.content !== 'transcript') {
        throw new ContractError({
          code: 'conflict',
          message: "Summaries can't be exported yet.",
        });
      }
      if (!EXPORTABLE.has(meeting.status)) {
        throw new ContractError({
          code: 'conflict',
          message: 'This meeting has no transcript to export yet.',
        });
      }
      const data = await toMeeting(meeting);
      const exportId = randomUUID();
      void run(exportId, meeting, data, request).then(
        (fileName) =>
          emit('exportFinished', { exportId, meetingId: meeting.id, ok: true, fileName }),
        (error: unknown) => {
          library.logger.log('error', 'export-failed', {
            meetingId: meeting.id,
            ...errorFields(error),
          });
          emit('exportFinished', {
            exportId,
            meetingId: meeting.id,
            ok: false,
            message: failureMessage(error),
          });
        },
      );
      return { exportId };
    },
  };
}
