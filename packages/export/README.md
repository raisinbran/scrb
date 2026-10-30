# @scrb/export

Turns one meeting into a **Transcript**, **Summary** or **Both** export. Everything is decided once, in a shared layout, and then rendered to DOCX or to HTML that Electron prints to PDF, so the two formats hold the same information.

```ts
import { buildExportDocument, renderDocx, renderPdf } from '@scrb/export';

const document = buildExportDocument(meeting, {
  scope: 'both',
  transcript: { timestamps: true, showCorrections: true },
  summary: { length: 'brief', openQuestions: true, sourceTimestamps: true },
});

const docx = await renderDocx(document, { pageSize: 'Letter' });
const pdf = await renderPdf(document, printHtmlToPdf, { pageSize: 'Letter' });
```

- `src/types.ts`: the narrow input types and options. The caller maps them from the shared contract.
- `src/layout.ts`: `buildExportDocument`, the shared layout. All wording lives here.
- `src/render-docx.ts`, `src/render-html.ts`: map layout blocks to a format and add no content.
- `src/render-pdf.ts`: passes the HTML and print options to an injected function. This package never imports Electron.

`buildExportDocument` throws `ExportInputError` with a `code` for a missing summary (`no-summary`), a length that has not been generated (`summary-length-missing`) or an unreadable date (`invalid-date`). It never swaps in the other summary length.

## Wiring the printer

`printHtmlToPdf` belongs to the app. It loads the HTML in a hidden window with JavaScript off and calls `webContents.printToPDF(options)`.

- Load long meetings from a file, not a `data:` URL. Keep that file in the meeting's own folder and delete it afterwards, because transcript text may exist only there.
- `renderDocx` is CPU work. Run it outside the Electron main process.

## Tests

```bash
npm test
```

The tests read both outputs back with real parsers (`test/parse-back.ts`) and require identical blocks, text, marks, tables and direction, across all option combinations and for an 8-hour meeting. All fixtures are invented. Word itself is not part of the tests.
