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
3. Repeat all six combinations for a saved imported meeting as required V11 parity coverage. Use the invented speech-based fixture from `v-j-import-formats.md`; never use a real recording. Use a long-content imported meeting to check pagination and read back the full transcript and selected metadata (title, date, duration, speaker names, timestamps and correction state). Confirm imported-meeting Transcript, Summary and Both content matches the corresponding exports and that summary tables/options are present in both formats. Record any unavailable fixture or behavior as NOT VERIFIED; the six short-meeting exports do not cover this imported long-content check.
4. Keep generated files and diagnostic evidence under the temporary test root until the owner passes the relevant gate and authorizes cleanup. Do not run any test whose full planned setup, export and read-back is expected to exceed 20 minutes without prior owner approval.

## Acceptance record

For each platform and each matrix case, record `PASS`, `FAIL` or `NOT VERIFIED` with the evidence location. Identify the exact Scribe version, source commit, package filename, architecture, package SHA-256 and host OS version. Record the invented fixture identifier and hash, the isolated temporary profile/library used, and any relevant output/read-back checks. Keep installed results separate from unit-test and CI results. If no packaged candidate or platform evidence is available, mark installed acceptance `NOT VERIFIED`.

## Automated coverage without an installed build

- `apps/desktop/src/main/export.test.ts` exercises all six content/format combinations using an invented saved import and reads DOCX/PDF-rendered content back. DOCX uses the real renderer; PDF uses the injected printer boundary.
- `packages/export/test/parity.test.ts`, `pdf.test.ts` and `layout.test.ts` check shared-layout parity, PDF rendering and document structure.
- Run `npm run check` for the unit suite. These tests do not establish installed-host PDF rendering or file-open behavior; that remains an installed-build acceptance check.
