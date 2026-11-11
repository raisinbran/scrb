// @vitest-environment node
import { mkdtemp, mkdir, readFile, readdir, access, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Library } from '@scrb/storage';
import type { ExportRequest } from '@scrb/contracts';
import { ExportCoordinator, cleanupOrphanPdfPrints, printPdf } from './exports.ts';
import { pdfPrintOptions } from '../../../../packages/export/src/render-pdf.ts';

const electron = vi.hoisted(() => ({
  windows: [] as Array<{ options: unknown; file: string | null; destroyed: boolean }>,
  load: vi.fn(),
  loadUrl: vi.fn(async (url: string) => {
    if (url.length > 2_000_000) throw new Error('ERR_INVALID_URL');
  }),
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
    async loadURL(url: string) {
      return electron.loadUrl(url);
    }
    destroy() {
      this.record.destroyed = true;
    }
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
      await expect(
        exporter.handlers.exportMeeting!({
          ...REQUEST,
          meetingId: 'invented-missing-id',
        }),
      ).rejects.toMatchObject({ code: 'notFound' });
      const busy = await library.createMeeting({ title: 'Invented Busy', status: 'recording' });
      await expect(
        exporter.handlers.exportMeeting!({
          ...REQUEST,
          meetingId: busy.id,
        }),
      ).rejects.toMatchObject({ code: 'conflict' });
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
      expect(
        files.every((name) => name.includes('Invented private name') && name.endsWith('.pdf')),
      ).toBe(true);
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
      const root = await mkdtemp(join(tmpdir(), 'scrb-export-print-'));
      const library = await Library.open({ root });
      electron.windows.length = 0;
      electron.load.mockImplementation(async (file: string) => {
        path = file;
        const scratch = relative(library.paths.cache, dirname(file));
        expect(scratch).toMatch(/^scrb-pdf-[0-9a-f-]{36}$/i);
        expect(await readFile(file, 'utf8')).toBe(html);
      });
      electron.print.mockImplementation(async () => {
        if (outcome === 'print failure') throw new Error('invented PDF failure');
        return Buffer.from('%PDF synthetic');
      });
      try {
        if (outcome === 'print failure') {
          await expect(printPdf(html, pdfPrintOptions(), library.paths.cache)).rejects.toThrow(
            'invented PDF failure',
          );
        } else {
          expect(await printPdf(html, pdfPrintOptions(), library.paths.cache)).toEqual(
            Buffer.from('%PDF synthetic'),
          );
        }
        expect(electron.load).toHaveBeenCalledOnce();
        expect(electron.loadUrl).not.toHaveBeenCalled();
        expect(electron.print).toHaveBeenCalledOnce();
        expect(electron.windows[0]?.options).toMatchObject({
          webPreferences: { javascript: false, nodeIntegration: false, sandbox: true },
        });
        expect(electron.windows[0]?.destroyed).toBe(true);
        await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(await readdir(library.paths.cache)).toEqual([]);
      } finally {
        await library.close();
        electron.load.mockReset();
        electron.loadUrl.mockReset();
        electron.print.mockReset();
      }
    },
  );

  it('clears only UUID-named abandoned PDF scratch directories on startup', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-recovery-'));
    const library = await Library.open({ root });
    try {
      const orphan = join(library.paths.cache, 'scrb-pdf-11111111-2222-4333-8444-555555555555');
      const unrelated = join(library.paths.cache, 'keep-existing');
      const nearName = join(library.paths.cache, 'scrb-pdf-not-an-owned-uuid');
      await mkdir(orphan);
      await writeFile(join(orphan, 'document.html'), 'synthetic private PDF body');
      await mkdir(unrelated);
      await mkdir(nearName);
      await cleanupOrphanPdfPrints(library.paths.cache);
      await expect(access(orphan)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(library.paths.cache)).toEqual([
        'keep-existing',
        'scrb-pdf-not-an-owned-uuid',
      ]);
    } finally {
      await library.close();
    }
  });

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
