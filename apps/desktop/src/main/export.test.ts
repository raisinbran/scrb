// @vitest-environment node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  statSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import type { ExportFinished, ExportRequest } from '@scrb/contracts';
import { Library } from '@scrb/storage';
import { buildExportDocument, renderHtml, type ExportMeeting } from '@scrb/export';
import { dispatchCall, type CallHandlers } from './dispatch.ts';
import { chosenTarget, createExportHandlers, exportFileStem } from './export.ts';
import { createDocxRenderer } from './export-worker.ts';
import { allowPrintNavigation, allowPrintRequest } from './print-guard.ts';
import { printWebPreferences } from './web-preferences.ts';

const FAKE_PDF = new TextEncoder().encode('%PDF-fake');
const speaker = (id: string) => ({
  id,
  label: id,
  name: null,
  profileId: null,
  userNamed: false,
  mergedInto: null,
});

describe('createExportHandlers', () => {
  let library: Library;
  let handlers: CallHandlers;
  let finished: ExportFinished[];
  let waiting: (() => void)[];
  const print = vi.fn();
  const chooseSavePath = vi.fn();
  const revealPath = vi.fn();
  let locationFile: string;

  beforeEach(async () => {
    library = await Library.open({ root: mkdtempSync(join(tmpdir(), 'scrb-export-')) });
    finished = [];
    waiting = [];
    print.mockReset();
    print.mockImplementation(async () => FAKE_PDF);
    // The user accepts the suggested name and folder unless a test says otherwise.
    chooseSavePath.mockReset();
    chooseSavePath.mockImplementation(async ({ defaultPath }) => defaultPath);
    revealPath.mockReset();
    locationFile = join(mkdtempSync(join(tmpdir(), 'scrb-export-loc-')), 'export-location.json');
    handlers = createExportHandlers({
      library,
      emit: (name, payload) => {
        if (name === 'exportFinished') {
          finished.push(payload as ExportFinished);
          waiting.splice(0).forEach((resolve) => resolve());
        }
      },
      print,
      chooseSavePath,
      revealPath,
      locationFile,
      // A real DOCX header without the worker; the worker has its own test below.
      renderDocx: async () => new Uint8Array([0x50, 0x4b, 3, 4]),
    });
  });

  afterEach(() => library.close());

  const settled = async () => {
    if (finished.length === 0) await new Promise<void>((resolve) => waiting.push(resolve));
    return finished.at(-1) as ExportFinished;
  };

  const request = (meetingId: string, over: Partial<ExportRequest> = {}): ExportRequest => ({
    meetingId,
    content: 'transcript',
    format: 'docx',
    transcript: {
      title: true,
      date: true,
      duration: true,
      speakerNames: true,
      timestamps: true,
      showCorrections: true,
    },
    summary: { length: 'brief', openQuestions: true, sourceTimestamps: true },
    ...over,
  });

  const seed = async (title = 'Invented sync', status: 'ready' | 'recording' = 'ready') => {
    const { id } = await library.createMeeting({
      title,
      date: '2026-11-03T10:00:00Z',
      source: 'recorded',
      status,
      durationMs: 5000,
    });
    await library.appendSegments(
      id,
      [
        {
          id: 's1',
          speakerId: 'a',
          track: 'meeting',
          pass: 'final',
          words: [
            { id: 'w1', text: 'hello', startMs: 0, endMs: 400 },
            { id: 'w2', text: 'there', startMs: 500, endMs: 900 },
          ],
        },
      ],
      [speaker('a')],
    );
    return id;
  };

  const exportsOf = (id: string) => {
    const folder = library.meetingPaths(id).exports;
    return existsSync(folder) ? readdirSync(folder) : [];
  };

  it('writes a DOCX into the meeting exports folder and reports the base name', async () => {
    const id = await seed();
    const result = await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(result).toMatchObject({ ok: true, value: { exportId: expect.any(String) } });
    const event = await settled();
    expect(event).toMatchObject({ ok: true, fileName: 'Invented sync-2026-11-03.docx' });
    const bytes = readFileSync(
      join(library.meetingPaths(id).exports, 'Invented sync-2026-11-03.docx'),
    );
    expect(bytes.subarray(0, 2).toString()).toBe('PK');
    expect(exportsOf(id)).toEqual(['Invented sync-2026-11-03.docx']);
  });

  it('writes a PDF through the injected printer and leaves no temporary files', async () => {
    const id = await seed();
    await dispatchCall(handlers, 'exportMeeting', request(id, { format: 'pdf' }));
    expect(await settled()).toMatchObject({ ok: true, fileName: 'Invented sync-2026-11-03.pdf' });
    expect(print).toHaveBeenCalledOnce();
    expect(print.mock.calls[0]?.[0].html).toContain('hello there');
    expect(exportsOf(id)).toEqual(['Invented sync-2026-11-03.pdf']);
  });

  it('writes WebVTT captions as UTF-8 text with the speaker as a voice tag', async () => {
    const id = await seed();
    await dispatchCall(handlers, 'exportMeeting', request(id, { format: 'vtt' }));
    expect(await settled()).toMatchObject({ ok: true, fileName: 'Invented sync-2026-11-03.vtt' });
    const text = readFileSync(
      join(library.meetingPaths(id).exports, 'Invented sync-2026-11-03.vtt'),
      'utf8',
    );
    expect(text).toBe('WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.900\n<v a>hello there</v>\n');
    expect(exportsOf(id)).toEqual(['Invented sync-2026-11-03.vtt']);
  });

  it('keeps a hostile title inside the exports folder', async () => {
    const id = await seed('../../x/\\..\\y');
    await dispatchCall(handlers, 'exportMeeting', request(id));
    const event = await settled();
    expect(event.ok && event.fileName).not.toMatch(/[\\/]/);
    expect(exportsOf(id)).toHaveLength(1);
    expect(exportFileStem('', '2026-11-03T10:00:00Z')).toBe('transcript-2026-11-03');
    expect(exportFileStem('a'.repeat(100), '2026-11-03')).toHaveLength(60 + '-2026-11-03'.length);
    expect(exportFileStem('...', '2026-11-03')).toBe('transcript-2026-11-03');
  });

  it('replaces a file the user chose to overwrite and keeps one name per export', async () => {
    const id = await seed();
    await dispatchCall(handlers, 'exportMeeting', request(id));
    await settled();
    finished.length = 0;
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: true, fileName: 'Invented sync-2026-11-03.docx' });
    expect(exportsOf(id)).toEqual(['Invented sync-2026-11-03.docx']);
  });

  it('writes to the chosen folder, appends a missing extension and remembers the folder', async () => {
    const id = await seed();
    const dir = mkdtempSync(join(tmpdir(), 'scrb-export-pick-'));
    chooseSavePath.mockResolvedValueOnce(join(dir, 'Board notes'));
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: true, fileName: 'Board notes.docx' });
    expect(readdirSync(dir)).toEqual(['Board notes.docx']);
    expect(exportsOf(id)).toEqual([]);
    finished.length = 0;
    await dispatchCall(handlers, 'exportMeeting', request(id));
    await settled();
    expect(chooseSavePath.mock.calls[1]?.[0].defaultPath).toBe(
      join(dir, 'Invented sync-2026-11-03.docx'),
    );
  });

  it('starts in the meeting exports folder first, and again when the remembered folder is gone', async () => {
    const id = await seed();
    const gone = mkdtempSync(join(tmpdir(), 'scrb-export-gone-'));
    writeFileSync(locationFile, JSON.stringify({ folder: gone }));
    rmSync(gone, { recursive: true });
    await dispatchCall(handlers, 'exportMeeting', request(id));
    await settled();
    expect(dirname(chooseSavePath.mock.calls[0]?.[0].defaultPath)).toContain('exports');
    expect(readFileSync(locationFile, 'utf8')).not.toContain(gone);
  });

  it('cancel writes nothing, leaves no temporary file and keeps the remembered folder', async () => {
    const id = await seed();
    chooseSavePath.mockResolvedValueOnce(null);
    await dispatchCall(handlers, 'exportMeeting', request(id, { format: 'pdf' }));
    expect(await settled()).toMatchObject({ ok: false, cancelled: true });
    expect(exportsOf(id)).toEqual([]);
    expect(existsSync(locationFile)).toBe(false);
    expect(print).not.toHaveBeenCalled();
  });

  it('keeps the old file when the export fails after the user chose it', async () => {
    const id = await seed();
    const dir = mkdtempSync(join(tmpdir(), 'scrb-export-keep-'));
    const target = join(dir, 'old.docx');
    writeFileSync(target, 'old bytes');
    chooseSavePath.mockResolvedValueOnce(target);
    const failing = createExportHandlers({
      library,
      emit: (name, payload) => {
        if (name === 'exportFinished') finished.push(payload as ExportFinished);
        waiting.splice(0).forEach((resolve) => resolve());
      },
      print,
      chooseSavePath,
      revealPath,
      locationFile,
      renderDocx: async () => {
        throw Object.assign(new Error('x'), { code: 'EACCES' });
      },
    });
    await dispatchCall(failing, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: false, message: "Couldn't save there." });
    expect(readFileSync(target, 'utf8')).toBe('old bytes');
    expect(readdirSync(dir)).toEqual(['old.docx']);
  });

  it('refuses a directory or another export extension and reports an unwritable folder', async () => {
    const id = await seed();
    const dir = mkdtempSync(join(tmpdir(), 'scrb-export-bad-'));
    chooseSavePath.mockResolvedValueOnce(dir + '.docx').mockResolvedValueOnce(join(dir, 'a.pdf'));
    mkdirSync(dir + '.docx');
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: false, message: "Couldn't save there." });
    finished.length = 0;
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({
      ok: false,
      message: 'Choose a file name ending in .docx.',
    });
    finished.length = 0;
    chooseSavePath.mockResolvedValueOnce(join(dir, 'missing', 'x.docx'));
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: false, message: "Couldn't save there." });
    expect(statSync(dir).isDirectory()).toBe(true);
  });

  it('fails with a clear message when the window is gone', async () => {
    const id = await seed();
    chooseSavePath.mockRejectedValueOnce(new Error('The window was closed.'));
    await dispatchCall(handlers, 'exportMeeting', request(id));
    expect(await settled()).toMatchObject({ ok: false });
  });

  it('chosenTarget forces the format extension', () => {
    expect(chosenTarget('/a/b.DOCX', 'docx')).toBe('/a/b.DOCX');
    expect(chosenTarget('/a/Meeting 10.30', 'vtt')).toBe('/a/Meeting 10.30.vtt');
    expect(() => chosenTarget('/a/b.pdf', 'docx')).toThrow();
    expect(() => chosenTarget('relative.docx', 'docx')).toThrow();
  });

  it('reveals only a file this run saved, by export id', async () => {
    const id = await seed();
    const { value } = (await dispatchCall(handlers, 'exportMeeting', request(id))) as {
      value: { exportId: string };
    };
    await settled();
    expect(
      await dispatchCall(handlers, 'revealExport', { exportId: value.exportId }),
    ).toMatchObject({
      ok: true,
    });
    expect(revealPath).toHaveBeenCalledOnce();
    // Compared through realpath: the temp folder may be a short or linked name.
    expect(realpathSync.native(revealPath.mock.calls[0]?.[0] as string)).toBe(
      realpathSync.native(join(library.meetingPaths(id).exports, 'Invented sync-2026-11-03.docx')),
    );
    revealPath.mockClear();
    expect(
      await dispatchCall(handlers, 'revealExport', { exportId: 'not-an-export' }),
    ).toMatchObject({ ok: false, error: { code: 'notFound' } });
    expect(revealPath).not.toHaveBeenCalled();
  });

  it('refuses before starting when there is nothing to export', async () => {
    const empty = (
      await library.createMeeting({
        title: 'Invented empty',
        date: '2026-11-03T10:00:00Z',
        source: 'recorded',
        status: 'ready',
        durationMs: 1000,
      })
    ).id;
    const recording = await seed('Invented live', 'recording');
    const noWords = await seed('Invented silent');
    await library.appendSegments(
      noWords,
      [{ id: 's2', speakerId: 'a', track: 'microphone', pass: 'final', words: [] }],
      [speaker('a')],
    );
    const failed = (
      await library.createMeeting({
        title: 'Invented failed',
        date: '2026-11-03T10:00:00Z',
        source: 'recorded',
        status: 'transcriptionFailed',
        durationMs: 1000,
      })
    ).id;
    for (const id of [empty, recording, failed]) {
      expect(await dispatchCall(handlers, 'exportMeeting', request(id))).toMatchObject({
        ok: false,
        error: { code: 'conflict' },
      });
      expect(exportsOf(id)).toEqual([]);
    }
    const none = await seed('Invented none');
    for (const content of ['summary', 'both'] as const) {
      expect(
        await dispatchCall(handlers, 'exportMeeting', request(none, { content })),
      ).toMatchObject({
        ok: false,
        error: { code: 'conflict' },
      });
    }
    expect(finished).toEqual([]);
    expect(
      await dispatchCall(
        handlers,
        'exportMeeting',
        request('00000000-0000-4000-8000-000000000000'),
      ),
    ).toMatchObject({ ok: false, error: { code: 'notFound' } });
  });

  it('reports a printer failure as a failed export with no files left', async () => {
    const id = await seed();
    print.mockRejectedValue(new Error('/private/path boom'));
    await dispatchCall(handlers, 'exportMeeting', request(id, { format: 'pdf' }));
    const event = await settled();
    expect(event).toEqual({
      exportId: expect.any(String),
      meetingId: id,
      ok: false,
      message: 'The PDF could not be created. Try DOCX.',
    });
    expect(exportsOf(id)).toEqual([]);
  });

  it('sweeps only its own stale temporary files and never user files', async () => {
    const id = await seed();
    const folder = library.meetingPaths(id).exports;
    mkdirSync(folder, { recursive: true });
    const old = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const uuid = '123e4567-e89b-42d3-a456-426614174000';
    const ours = [`.scrb-export-${uuid}.part`, `.scrb-print-${uuid}.html`];
    const theirs = ['x.part', 'notes.print-1', '.print-abc.html', '.abc.part', 'keep.docx'];
    for (const name of [...ours, ...theirs]) {
      writeFileSync(join(folder, name), 'data');
      utimesSync(join(folder, name), old, old);
    }
    const outside = join(folder, '..', 'outside.txt');
    writeFileSync(outside, 'secret');
    const linkName = `.scrb-export-123e4567-e89b-42d3-a456-426614174001.part`;
    symlinkSync(outside, join(folder, linkName));
    await dispatchCall(handlers, 'exportMeeting', request(id));
    await settled();
    const left = readdirSync(folder);
    for (const name of ours) expect(left).not.toContain(name);
    for (const name of [...theirs, linkName]) expect(left).toContain(name);
    expect(readFileSync(outside, 'utf8')).toBe('secret');
  });

  it('keeps the original text of a corrected word when corrections are shown', async () => {
    const id = await seed();
    await library.applyCorrection(id, { wordIds: ['w2'], replacement: 'Harbour', remember: false });
    await dispatchCall(handlers, 'exportMeeting', request(id, { format: 'pdf' }));
    await settled();
    const html = print.mock.calls[0]?.[0].html as string;
    expect(html).toContain('Harbour');
    expect(html).toContain('there');
  });
});

describe('print window rules', () => {
  const page = 'file:///library/exports/.print-1.html';

  it('allows only the one page', () => {
    expect(allowPrintRequest(page, page)).toBe(true);
    for (const url of [
      'file:///etc/passwd',
      'file:///library/exports/.print-2.html',
      'https://example.com/a.png',
      'http://localhost/x',
      'data:text/html,hi',
      'ws://localhost:1',
      'not a url',
    ]) {
      expect(allowPrintRequest(url, page)).toBe(false);
    }
    expect(allowPrintNavigation()).toBe(false);
  });

  it('keeps the locked settings, with no preload and no scripts', () => {
    expect(printWebPreferences()).toEqual({
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      javascript: false,
    });
    expect(printWebPreferences()).not.toHaveProperty('preload');
  });

  it('generates HTML with no remote references or scripts', () => {
    const meeting: ExportMeeting = {
      title: 'Invented <b>title</b>',
      startedAt: '2026-11-03T10:00:00Z',
      durationMs: 60_000,
      speakers: [{ id: 'a', name: 'Ana' }],
      segments: [{ speakerId: 'a', startMs: 0, parts: [{ text: '<img src="x.png"> hi' }] }],
    };
    const html = renderHtml(buildExportDocument(meeting, { scope: 'transcript' }));
    for (const forbidden of ['http:', 'https:', '<script', '<link', '<img', '<b>']) {
      expect(html.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('DOCX worker', () => {
  const out = mkdtempSync(join(tmpdir(), 'scrb-worker-'));
  afterEach(() => undefined);

  it('builds a one-hour transcript off the main thread', async () => {
    const entry = join(out, 'exportWorkerEntry.mjs');
    await build({
      entryPoints: [join(__dirname, 'exportWorkerEntry.ts')],
      outfile: entry,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      logLevel: 'silent',
    });
    const segments = Array.from({ length: 10_000 }, (_, i) => ({
      speakerId: i % 2 ? 'a' : 'b',
      startMs: i * 360,
      parts: [{ text: 'invented words in a long invented sentence for the test' }],
    }));
    const meeting: ExportMeeting = {
      title: 'Invented long meeting',
      startedAt: '2026-11-03T10:00:00Z',
      durationMs: 3_600_000,
      speakers: [
        { id: 'a', name: 'Ana' },
        { id: 'b', name: 'Ben' },
      ],
      segments,
    };
    let worst = 0;
    let last = performance.now();
    const ticker = setInterval(() => {
      const now = performance.now();
      worst = Math.max(worst, now - last - 50);
      last = now;
    }, 50);
    const bytes = await createDocxRenderer(
      entry,
      120_000,
    )({
      meeting,
      request: { scope: 'transcript' },
      pageSize: 'Letter',
    });
    clearInterval(ticker);
    rmSync(out, { recursive: true, force: true });
    expect(Buffer.from(bytes.subarray(0, 2)).toString()).toBe('PK');
    expect(worst).toBeLessThan(250);
  }, 120_000);
});
