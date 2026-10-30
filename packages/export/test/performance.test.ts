import { describe, expect, it } from 'vitest';
import { buildExportDocument, renderDocx, renderHtml } from '../src/index.js';
import { longMeeting } from './fixtures.js';
import { allText, parseDocx, parseHtml } from './parse-back.js';

// Budgets are generous so the suite holds on a busy laptop at low priority.
// They exist to catch accidental quadratic work, not to measure speed.
const BUDGET_MS = 30_000;

async function timed<T>(label: string, work: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await work();
  const elapsed = performance.now() - start;
  console.log(`${label}: ${Math.round(elapsed)} ms`);
  expect(elapsed).toBeLessThan(BUDGET_MS);
  return result;
}

describe('8-hour meetings', () => {
  it('exports with every option on, and the two formats still match', async () => {
    const meeting = longMeeting(8);
    const request = { scope: 'both', transcript: { showCorrections: true } } as const;

    const document = await timed('layout', () => buildExportDocument(meeting, request));
    const html = await timed('html', () => renderHtml(document));
    const docx = await timed('docx', () => renderDocx(document));

    console.log(
      `${meeting.segments.length} segments, html ${Math.round(html.length / 1e6)} MB, docx ${Math.round(docx.length / 1e6)} MB`,
    );

    const parsedDocx = parseDocx(docx);
    const parsedHtml = parseHtml(html);
    expect(parsedDocx).toEqual(parsedHtml);
    expect(allText(parsedDocx)).toContain(`${meeting.segments.length - 1} `);
  });

  it('grows about linearly from 2 to 8 hours', async () => {
    const run = async (hours: number) => {
      const document = buildExportDocument(longMeeting(hours), { scope: 'transcript' });
      const start = performance.now();
      await renderDocx(document);
      return performance.now() - start;
    };
    await run(1); // warm up the JIT so the first sample is not inflated
    const short = await run(2);
    const long = await run(8);
    expect(long / short).toBeLessThan(10);
  });
});
