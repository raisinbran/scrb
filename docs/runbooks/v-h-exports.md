# V-h — Exports (V11)

## Scope and fixture

Check Transcript, Summary and Both in DOCX and PDF: six combinations. Use a disposable installed build profile and invented meeting data only. Seed a short transcript containing one invented correction and a summary with an invented paragraph, action item and decision; do not use a real meeting or transcript. Keep the source meeting in the temporary library for all six exports.

## Case matrix

| Content    | Format | Expected result                                                                                                                                                                                                                            |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transcript | DOCX   | A readable `.docx` is saved under the meeting's `exports/` folder and opens in Word or a compatible editor. It contains the selected transcript metadata, speaker labels, timestamps and corrected text; it excludes summary-only content. |
| Transcript | PDF    | A readable `.pdf` is saved in the same folder and opens in Preview or a compatible viewer. Its transcript content and selected metadata match the DOCX transcript; it excludes summary-only content.                                       |
| Summary    | DOCX   | A readable `.docx` is saved and opens. It includes the selected Brief or Full narrative, action-item and decision tables, and enabled open-question/source-timestamp options; it excludes transcript-only content.                         |
| Summary    | PDF    | A readable `.pdf` is saved and opens. Summary sections and tables match the DOCX summary, including enabled options.                                                                                                                       |
| Both       | DOCX   | A readable `.docx` is saved and opens. It contains transcript and summary content in the shared layout without dropping the correction, metadata or tables.                                                                                |
| Both       | PDF    | A readable `.pdf` is saved and opens. Its transcript, summary and metadata match the DOCX Both export.                                                                                                                                     |

For each row, check the completion result and displayed filename, confirm the file is in that meeting's `exports/` folder, and read it back. A failed export must report failure and must not be counted as a successful file. Keep the saved meeting available so parity can be compared across the two formats.

## Installed-build procedure

1. Install and launch the candidate build with a disposable profile and library. Use only a seeded, invented meeting with a short transcript and summary.
2. For each matrix row, open that meeting's Export dialog, select the content and format, and export. Check the saved file, open it, and compare it with the matching format/content row above.
3. Repeat for a saved imported meeting if V05 import acceptance is in scope. Never use a real recording.
4. Keep generated files and diagnostic evidence under the temporary test root until the owner passes the relevant gate and authorizes cleanup. Do not run any test whose full planned setup, export and read-back is expected to exceed 20 minutes without prior owner approval.

## Automated coverage without an installed build

- `apps/desktop/src/main/export.test.ts` exercises all six content/format combinations using an invented saved import and reads DOCX/PDF-rendered content back. DOCX uses the real renderer; PDF uses the injected printer boundary.
- `packages/export/test/parity.test.ts`, `pdf.test.ts` and `layout.test.ts` check shared-layout parity, PDF rendering and document structure.
- Run `npm run check` for the unit suite. These tests do not establish installed-host PDF rendering or file-open behavior; that remains an installed-build acceptance check.
