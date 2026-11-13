// Electron main script for the print-window security spec: prints hostile HTML through the real
// print function and records every request its session decided on. Not part of the app.
import { app } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { printHtmlToPdf } from '../../src/main/export-print.ts';

const out = process.env['PROBE_OUT'] as string;
const hits: string[] = [];
const server = http.createServer((request, response) => {
  hits.push(request.url ?? '');
  response.end('x');
});

// Without this, destroying the print window (the only one) quits the app before the result is written.
app.on('window-all-closed', () => undefined);

void app.whenReady().then(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const dir = fs.mkdtempSync(path.join(process.env['PROBE_DIR'] as string, 'probe-'));
  const other = path.join(dir, 'other-local.png');
  fs.writeFileSync(other, 'x');
  const net = `http://127.0.0.1:${port}`;
  const html =
    `<html><body><p>probe</p><img src="${net}/net-img"><img src="file://${other}">` +
    `<link rel="stylesheet" href="${net}/net-css"><link rel="stylesheet" href="file://${other}">` +
    `<script src="${net}/net-js"></script></body></html>`;
  const requests: { url: string; allowed: boolean }[] = [];
  let pdfHeader = '';
  let error = '';
  try {
    const pdf = await printHtmlToPdf({
      html,
      folder: dir,
      exportId: '123e4567-e89b-42d3-a456-426614174000',
      onRequest: (url, allowed) => requests.push({ url, allowed }),
      options: {
        pageSize: 'Letter',
        printBackground: true,
        displayHeaderFooter: false,
        headerTemplate: '',
        footerTemplate: '',
        margins: { top: 1, bottom: 1, left: 1, right: 1 },
        generateTaggedPDF: true,
        generateDocumentOutline: true,
      } as never,
    });
    pdfHeader = Buffer.from(pdf.subarray(0, 5)).toString();
  } catch (caught) {
    error = String(caught);
  }
  fs.writeFileSync(
    out,
    JSON.stringify({ requests, hits, pdfHeader, error, other, left: fs.readdirSync(dir) }),
  );
  app.exit(0);
});
