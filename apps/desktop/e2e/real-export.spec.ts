import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import type { ExportFinished } from '@scrb/contracts';
import { Library } from '@scrb/storage';

const TITLE = 'Invented export check';
const RECAP = 'The harbour team approved the purchase.';
const CORRECTION = 'Corrected pier';
const END = 'Last invented transcript line';
const scopes = ['transcript', 'summary', 'both'] as const;
const formats = ['docx', 'pdf'] as const;

async function pdfText(bytes: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await getDocument({ data: new Uint8Array(bytes) }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}

test('writes and reads back all six exports from an invented imported meeting', async () => {
  test.setTimeout(180_000);
  const userData = mkdtempSync(join(tmpdir(), 'scrb-export-e2e-'));
  const root = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root }));
  const library = await Library.open({ root });
  const { id } = await library.createMeeting({
    title: TITLE,
    date: '2026-11-03T10:00:00Z',
    source: 'imported',
    status: 'ready',
    durationMs: 120_000,
  });
  const exportsDir = library.meetingPaths(id).exports;
  try {
    await library.appendSegments(
      id,
      Array.from({ length: 100 }, (_, i) => ({
        id: `s${i}`,
        speakerId: 'a',
        track: 'meeting',
        pass: 'final',
        words: [
          {
            id: `w${i}`,
            text: i === 0 ? 'Original wharf' : i === 99 ? END : `Invented transcript line ${i}`,
            startMs: i * 1000,
            endMs: i * 1000 + 900,
          },
        ],
      })),
      [
        {
          id: 'a',
          label: 'Speaker 1',
          name: 'Ana',
          profileId: null,
          userNamed: true,
          mergedInto: null,
        },
      ],
    );
    await library.applyCorrection(id, {
      wordIds: ['w0'],
      replacement: CORRECTION,
      remember: false,
    });
    await library.saveGeneratedSummary(id, {
      generatedAt: null,
      brief: { sections: [{ id: 'brief', heading: null, text: RECAP, edited: false }] },
      full: null,
      actionItems: [],
      decisions: [],
      openQuestions: [],
      warnings: [],
    });
  } finally {
    await library.close();
  }

  const app = await electron.launch({
    args: ['.', `--user-data-dir=${userData}`],
    env: { ...process.env, SCRB_DEV_AUTO_LOCATION: '1' },
  });
  try {
    await app.evaluate(
      ({ dialog }, choices) => {
        let next = 0;
        dialog.showSaveDialog = (async (...args: unknown[]) => {
          const options = args.at(-1) as { defaultPath: string };
          return {
            canceled: false,
            filePath: options.defaultPath.replace(/[^/\\]+$/, choices[next++]!),
          };
        }) as typeof dialog.showSaveDialog;
      },
      scopes.flatMap((scope) => formats.map((format) => `${scope}.${format}`)),
    );

    const page = await app.firstWindow();
    for (const content of scopes) {
      for (const format of formats) {
        const result = await page.evaluate(
          async ({ meetingId, content, format }) => {
            const bridge = window.scribeBridge;
            if (!bridge) throw new Error('no bridge');
            let finish!: (event: ExportFinished) => void;
            const finished = new Promise<ExportFinished>((resolve) => {
              finish = resolve;
            });
            const unsubscribe = bridge.subscribe('exportFinished', (payload) =>
              finish(payload as ExportFinished),
            );
            try {
              const accepted = await bridge.invoke('exportMeeting', {
                meetingId,
                content,
                format,
                transcript: {
                  title: true,
                  date: true,
                  duration: true,
                  speakerNames: true,
                  timestamps: true,
                  showCorrections: true,
                },
                summary: { length: 'brief', openQuestions: true, sourceTimestamps: true },
              });
              if (!accepted.ok) throw new Error(accepted.error.message);
              return await finished;
            } finally {
              unsubscribe();
            }
          },
          { meetingId: id, content, format },
        );
        const fileName = `${content}.${format}`;
        expect(result, fileName).toMatchObject({ ok: true, fileName });
        const bytes = readFileSync(join(exportsDir, fileName));
        let text: string;
        if (format === 'docx') {
          const xml = strFromU8(unzipSync(bytes)['word/document.xml']!);
          text = [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(' ');
          if (content !== 'summary') expect(xml).toContain('<w:strike');
        } else {
          const pages = await pdfText(bytes);
          if (content !== 'summary') expect(pages.length).toBeGreaterThan(1);
          text = pages.join(' ');
        }
        // PDF text extraction can widen word gaps (justified lines), so compare with collapsed whitespace.
        text = text.replace(/\s+/g, ' ');
        expect(text).toContain(TITLE);
        expect(text).toContain('November 3, 2026');
        expect(text).toContain('Duration');
        if (content !== 'transcript') expect(text).toContain(RECAP);
        else expect(text).not.toContain(RECAP);
        if (content !== 'summary') {
          expect(text).toContain('Ana');
          expect(text).toContain('Original wharf');
          expect(text).toContain(CORRECTION);
          expect(text).toContain(END);
        } else {
          expect(text).not.toContain(CORRECTION);
          expect(text).not.toContain(END);
        }
      }
    }
    expect(readdirSync(exportsDir).sort()).toEqual(
      scopes.flatMap((content) => formats.map((format) => `${content}.${format}`)).sort(),
    );
  } finally {
    await app.close();
  }
});
