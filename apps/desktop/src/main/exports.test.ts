// @vitest-environment node
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Library } from '@scrb/storage';
import type { ExportRequest } from '@scrb/contracts';
import { ExportCoordinator } from './exports.ts';

vi.mock('electron', () => ({ BrowserWindow: class {} }));

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
      expect(files).toEqual([`meeting-${result.exportId}.pdf`]);
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

  it('keeps exporting after a job fails before its first await', async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-test-'));
    const library = await Library.open({ root });
    try {
      const meeting = await library.createMeeting({ title: 'Invented Export' });
      const events = vi.fn();
      const exporter = new ExportCoordinator(library, events, async () => Buffer.from('%PDF'));
      await exporter.handlers.exportMeeting!({
        ...REQUEST,
        meetingId: meeting.id,
        content: 'summary',
      });
      await vi.waitFor(() =>
        expect(events).toHaveBeenCalledWith(
          'exportFinished',
          expect.objectContaining({ ok: false, message: 'This meeting has no summary to export.' }),
        ),
      );
      await exporter.shutdown();
      await expect(
        exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: meeting.id }),
      ).resolves.toHaveProperty('exportId');
      await exporter.shutdown();
    } finally {
      await library.close();
    }
  });

  it("reports a busy or missing meeting in the contract's terms", async () => {
    const root = await mkdtemp(join(tmpdir(), 'scrb-export-test-'));
    const library = await Library.open({ root });
    try {
      const meeting = await library.createMeeting({
        title: 'Invented Export',
        status: 'recording',
      });
      const exporter = new ExportCoordinator(library, vi.fn(), async () => Buffer.from('%PDF'));
      await expect(
        exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: meeting.id }),
      ).rejects.toMatchObject({ code: 'conflict' });
      await expect(
        exporter.handlers.exportMeeting!({ ...REQUEST, meetingId: 'missing' }),
      ).rejects.toMatchObject({ code: 'notFound' });
    } finally {
      await library.close();
    }
  });
});
