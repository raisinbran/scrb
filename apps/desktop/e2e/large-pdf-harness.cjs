/* eslint-disable @typescript-eslint/no-require-imports, no-undef -- This Electron main test harness must be CommonJS. */
const { app, BrowserWindow } = require('electron');
const { mkdtemp, mkdir, readdir, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { printPdf } = require('./pdf-printer-test-bundle.cjs');

// Electron would normally exit when printPdf destroys its sole print window.
app.on('window-all-closed', () => {});
let scriptRan = false;
app.on('browser-window-created', (_event, window) => {
  window.on('page-title-updated', (_titleEvent, title) => {
    if (title === 'SCRIPT_RAN') scriptRan = true;
  });
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

app
  .whenReady()
  .then(async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'scrb-pdf-real-test-'));
    const cache = join(scratch, 'library-cache');
    try {
      await mkdir(cache);
      const html =
        '<!doctype html><html><head><title>Script disabled</title></head>' +
        '<body><h1>Invented large PDF</h1><p>Visible text</p><!--' +
        'A'.repeat(2_600_000) +
        '--><script>document.title="SCRIPT_RAN"</script></body></html>';
      assert(Buffer.byteLength(html, 'utf8') > 2_600_000, 'HTML fixture too small');
      const pdf = await printPdf(
        html,
        {
          pageSize: 'Letter',
          printBackground: true,
          displayHeaderFooter: false,
          margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
        },
        cache,
      );
      assert(Buffer.from(pdf).subarray(0, 5).toString() === '%PDF-', 'No Chromium PDF bytes');
      assert(pdf.byteLength > 1000, 'PDF has no meaningful bytes');
      assert(!scriptRan, 'HTML script executed during printing');
      assert(BrowserWindow.getAllWindows().length === 0, 'Printing left a window behind');
      assert((await readdir(cache)).length === 0, 'Printing left private HTML behind');
      console.log('Printed 2.6 MB HTML in real Electron; script disabled and cache cleaned.');
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  })
  .then(
    () => app.quit(),
    (error) => {
      console.error(error);
      process.exitCode = 1;
      app.quit();
    },
  );
