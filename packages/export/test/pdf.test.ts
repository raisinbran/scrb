import { describe, expect, it } from 'vitest';
import { buildExportDocument, renderHtml, renderPdf } from '../src/index.js';
import type { PdfPrintOptions } from '../src/index.js';
import { standardMeeting } from './fixtures.js';

describe('renderPdf', () => {
  it('hands the shared HTML to the injected printer and returns its bytes', async () => {
    const document = buildExportDocument(standardMeeting, { scope: 'both' });
    const pdf = new Uint8Array([37, 80, 68, 70]);
    const calls: { html: string; options: PdfPrintOptions }[] = [];

    const result = await renderPdf(
      document,
      async (html, options) => {
        calls.push({ html, options });
        return pdf;
      },
      { pageSize: 'A4' },
    );

    expect(result).toBe(pdf);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.html).toBe(renderHtml(document));
    expect(calls[0]?.options.pageSize).toBe('A4');
    expect(calls[0]?.options.footerTemplate).toContain('pageNumber');
  });

  it('passes printer failures to the caller', async () => {
    const document = buildExportDocument(standardMeeting, { scope: 'summary' });
    await expect(
      renderPdf(document, async () => {
        throw new Error('printer gone');
      }),
    ).rejects.toThrow('printer gone');
  });
});

describe('renderHtml safety', () => {
  it('escapes transcript text and loads nothing external', () => {
    const html = renderHtml(
      buildExportDocument(
        {
          ...standardMeeting,
          title: '<script>alert(1)</script>',
          segments: [
            { speakerId: 's1', startMs: 0, parts: [{ text: '<img src=https://example.com/x>' }] },
          ],
        },
        { scope: 'transcript' },
      ),
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=https://example.com/x&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/(?:src|href)="/);
  });
});
