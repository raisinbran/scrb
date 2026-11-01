import { app, BrowserWindow } from 'electron';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { printPdf } from './pdf-printer-test-bundle.cjs';

const scratch = await mkdtemp(join(tmpdir(), 'scrb-pdf-real-test-'));
const originalTmp = process.env.TMPDIR;
const originalTemp = process.env.TEMP;
const originalTmpWin = process.env.TMP;
process.env.TMPDIR = scratch;
process.env.TEMP = scratch;
process.env.TMP = scratch;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  await app.whenReady();
  const html = '<!doctype html><html><body><h1>Invented large PDF</h1><p>' +
    'A'.repeat(2_600_000) + '</p><script>document.title="SCRIPT_RAN"</script></body></html>';
  const pdf = await printPdf(html, {
    pageSize: 'Letter',
    printBackground: true,
    displayHeaderFooter: false,
    margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
  });
  assert(Buffer.from(pdf).subarray(0, 5).toString() === '%PDF-', 'Real Chromium did not return PDF');
  assert(pdf.byteLength > 1000, 'PDF has no meaningful bytes');
  assert(BrowserWindow.getAllWindows().length === 0, 'Printing left a window behind');
  assert((await readdir(scratch)).length === 0, 'Printing left temporary HTML behind');
  console.log('Real Electron printed a 2.6 MB HTML document, removed its file and window.');
} finally {
  process.env.TMPDIR = originalTmp;
  process.env.TEMP = originalTemp;
  process.env.TMP = originalTmpWin;
  await rm(scratch, { recursive: true, force: true });
  app.quit();
}
