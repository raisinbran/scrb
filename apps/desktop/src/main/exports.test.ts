// @vitest-environment node
import { mkdtemp, readFile, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Library } from '@scrb/storage';
import type { ExportRequest } from '@scrb/contracts';
import { ExportCoordinator, printPdf } from './exports.ts';
import { pdfPrintOptions } from '../../../../packages/export/src/render-pdf.ts';

const electron = vi.hoisted(() => ({
  windows: [] as Array<{ options: unknown; file: string | null; destroyed: boolean }>,
  load: vi.fn(),
  print: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly webContents = { printToPDF: electron.print };
    private readonly record: (typeof electron.windows)[number];
    constructor(options: unknown) {
      this.record = { options, file: null, destroyed: false };
      electron.windows.push(this.record);
    }
    async loadFile(file: string) {
      this.record.file = file;
      return electron.load(file);
    }
    destroy() { this.record.destroyed = true; }
  },
}));

const REQUEST = {
  meetingId: 'set-in-test',
  content: 'transcript',
  format: 'pdf',
  transcript: {
    title: true,
    date: true,
    duration: true,
    speakerNames: true,
    timestamps: true,
    showCorrections: true,
  },
  summary: { length: 'brief', openQuestions: true, sourceTimestamps: true },
} satisfies ExportRequest;

describe('desktop export jobs', () => {
  it('maps busy and missing storage errors to contract errors', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-errors-'));
    const library = await Library.open({ root });
    try {
      const exporter = new ExportCoordinator(library, vi.fn(), vi.fn());
      await expect(exporter.handlers.exportMeeting!({
        ...REQUEST, meetingId: 'invented-missing-id',
      })).rejects.toMatchObject({ code: 'notFound' });
      const busy = await library.createMeeting({ title: 'Invented Busy', status: 'recording' });
      await expect(exporter.handlers.exportMeeting!({
        ...REQUEST, meetingId: busy.id,
      })).rejects.toMatchObject({ code: 'conflict' });
      await exporter.shutdown();
    } finally {
      await library.close();
    }
  });

  it('sanitizes title-derived filenames and keeps repeated exports unique', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-names-'));
    const library = await Library.open({ root });
    try {
      const meeting = await library.createMeeting({ title: 'Invented: / private? name' });
      const exporter = new ExportCoordinator(library, vi.fn(), async () => Buffer.from('PDF'));
      const first = await exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: meeting.id });
      await exporter.shutdown();
      const second = await exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: meeting.id });
      await exporter.shutdown();
      const files = await readdir(library.meetingPaths(meeting.id).exports);
      expect(files).toHaveLength(2);
      expect(files.every((name) => name.includes('Invented private name') && name.endsWith('.pdf'))).toBe(true);
      expect(first).not.toEqual(second);
    } finally {
      await library.close();
    }
  });

  it.each(['success', 'print failure'] as const)(
    'prints HTML over the data-URL limit via private loadFile and cleans up on %s',
    async (outcome) => {
      const html = '<main>' + 'x'.repeat(2_600_000) + '</main>';
      let path = '';
      electron.windows.length = 0;
      electron.load.mockImplementation(async (file: string) => {
        path = file;
        expect(await readFile(file, 'utf8')).toBe(html);
      });
      electron.print.mockImplementation(async () => {
        if (outcome === 'print failure') throw new Error('invented PDF failure');
        return Buffer.from('%PDF synthetic');
      });
      try {
        if (outcome === 'print failure') {
          await expect(printPdf(html, pdfPrintOptions())).rejects.toThrow('invented PDF failure');
        } else {
          expect(await printPdf(html, pdfPrintOptions())).toEqual(Buffer.from('%PDF synthetic'));
        }
        expect(electron.load).toHaveBeenCalledOnce();
        expect(electron.print).toHaveBeenCalledOnce();
        expect(electron.windows[0]?.options).toMatchObject({
          webPreferences: { javascript: false, nodeIntegration: false, sandbox: true },
        });
        expect(electron.windows[0]?.destroyed).toBe(true);
        await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
      } finally {
        electron.load.mockReset();
        electron.print.mockReset();
      }
    },
  );

  it('uses a locked meeting snapshot and an app-owned atomic output path', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-test-'));
    const library = await Library.open({ root });
    try {
      const meeting = await library.createMeeting({ title: 'Invented Export' });
      const events = vi.fn();
      const html = vi.fn(async (markup: string) => {
        expect(markup).toContain('Invented Export');
        return Buffer.from('%PDF invented test bytes');
      });
      const exporter = new ExportCoordinator(library, events, html);
      const result = (await exporter.handlers.exportMeeting!({
        ...REQUEST,
        meetingId: meeting.id,
      })) as { exportId: string };
      await vi.waitFor(() =>
        expect(events).toHaveBeenCalledWith(
          'exportFinished',
          expect.objectContaining({ exportId: result.exportId, ok: true }),
        ),
      );
      const files = await readdir(library.meetingPaths(meeting.id).exports);
      expect(files).toHaveLength(1);
      expect(files[0]).toContain('Invented Export-' + result.exportId);
      expect(files[0]).toMatch(/\.pdf$/);
      expect(await readFile(join(library.meetingPaths(meeting.id).exports, files[0]!))).toEqual(
        Buffer.from('%PDF invented test bytes'),
      );
      await exporter.shutdown();
    } finally {
      await library.close();
    }
  });

  it('refuses deletion while a PDF export owns the meeting, then permits it after completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-busy-'));
    const library = await Library.open({ root });
    try {
      const meeting = await library.createMeeting({ title: 'Invented PDF' });
      const events = vi.fn();
      let finish!: (bytes: Uint8Array) => void;
      const exporter = new ExportCoordinator(
        library,
        events,
        async () =>
          new Promise<Uint8Array>((resolve) => {
            finish = resolve;
          }),
      );
      await exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: meeting.id });
      await expect(library.deleteMeeting(meeting.id)).rejects.toMatchObject({
        code: 'ACTIVE_MEETING',
      });
      finish(Buffer.from('%PDF invented bytes'));
      await exporter.shutdown();
      expect((await library.deleteMeeting(meeting.id)).ok).toBe(true);
    } finally {
      await library.close();
    }
  });
});
