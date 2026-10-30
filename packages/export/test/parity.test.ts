import { describe, expect, it } from 'vitest';
import { buildExportDocument, renderDocx, renderHtml } from '../src/index.js';
import type { ExportMeeting, ExportRequest, ExportScope } from '../src/index.js';
import { emptyMeeting, internationalMeeting, standardMeeting } from './fixtures.js';
import { allText, docxParts, parseDocx, parseHtml } from './parse-back.js';

async function outputs(meeting: ExportMeeting, request: ExportRequest) {
  const document = buildExportDocument(meeting, request);
  const docx = parseDocx(await renderDocx(document));
  const html = parseHtml(renderHtml(document));
  return { docx, html };
}

const SCOPES: ExportScope[] = ['transcript', 'summary', 'both'];
const FLAGS = [true, false];

describe('DOCX and HTML hold the same content', () => {
  const fixtures = {
    standard: standardMeeting,
    empty: emptyMeeting,
    international: internationalMeeting,
  };

  for (const [name, meeting] of Object.entries(fixtures)) {
    for (const scope of SCOPES) {
      it(`${name}, ${scope}, default options`, async () => {
        const { docx, html } = await outputs(meeting, { scope });
        expect(docx).toEqual(html);
      });
    }
  }

  it('every combination of options', async () => {
    let checked = 0;
    for (const scope of SCOPES)
      for (const length of ['brief', 'full'] as const)
        for (const openQuestions of FLAGS)
          for (const sourceTimestamps of FLAGS)
            for (const headerOn of FLAGS)
              for (const speakerNames of FLAGS)
                for (const timestamps of FLAGS)
                  for (const showCorrections of FLAGS) {
                    const request: ExportRequest = {
                      scope,
                      transcript: {
                        title: headerOn,
                        date: !headerOn,
                        duration: headerOn,
                        speakerNames,
                        timestamps,
                        showCorrections,
                      },
                      summary: { length, openQuestions, sourceTimestamps },
                    };
                    const { docx, html } = await outputs(standardMeeting, request);
                    expect(docx, JSON.stringify(request)).toEqual(html);
                    checked += 1;
                  }
    expect(checked).toBe(3 * 2 ** 7);
  });

  it('carries non-Latin text intact in both formats', async () => {
    const { docx, html } = await outputs(internationalMeeting, { scope: 'both' });
    for (const text of [
      '来月の移転計画を確認しましょう。',
      'نحتاج إلى تأكيد موعد الانتقال قبل يوم الجمعة 12.',
      'Смета готова, бюджет в норме 👍🏽.',
      'मैं कार्यालय का दौरा करूँगी।',
      '佐藤 美咲',
    ]) {
      expect(allText(docx)).toContain(text);
      expect(allText(html)).toContain(text);
    }
  });

  it('marks right-to-left paragraphs in both formats', async () => {
    const { docx, html } = await outputs(internationalMeeting, { scope: 'transcript' });
    expect(docx.filter((block) => block.type === 'p' && block.rtl).length).toBeGreaterThan(1);
    expect(docx).toEqual(html);
  });

  it('strips characters that would corrupt a Word file', async () => {
    const { docx } = await outputs(internationalMeeting, { scope: 'transcript' });
    expect(allText(docx)).toContain('bad chars\uFFFD here next line');
  });

  it('repeats table headers across pages in both formats', async () => {
    const { docx, html } = await outputs(standardMeeting, { scope: 'summary' });
    for (const blocks of [docx, html]) {
      const tables = blocks.filter((block) => block.type === 'table');
      expect(tables).toHaveLength(2);
      for (const table of tables) expect(table.headerRows).toBe(1);
    }
  });
});

describe('file metadata', () => {
  it('leaves the title out everywhere when the option is off', async () => {
    const document = buildExportDocument(standardMeeting, {
      scope: 'transcript',
      transcript: { title: false },
    });
    const parts = docxParts(await renderDocx(document));
    const html = renderHtml(document);
    expect(parts['docProps/core.xml']).not.toContain(standardMeeting.title);
    expect(parts['docProps/core.xml']).not.toContain('Un-named');
    expect(html).not.toContain(standardMeeting.title);
  });

  it('numbers pages in the DOCX footer', async () => {
    const parts = docxParts(await renderDocx(buildExportDocument(standardMeeting, { scope: 'both' })));
    const footer = parts['word/footer1.xml'];
    expect(footer).toContain('PAGE');
    expect(footer).toContain('NUMPAGES');
  });

  it('honours the page size', async () => {
    const document = buildExportDocument(standardMeeting, { scope: 'summary' });
    const a4 = docxParts(await renderDocx(document, { pageSize: 'A4' }));
    expect(a4['word/document.xml']).toMatch(/w:w="11906"/);
    const letter = docxParts(await renderDocx(document));
    expect(letter['word/document.xml']).toMatch(/w:w="12240"/);
  });
});
