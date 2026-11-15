### A-514 — 2026-11-15 — Codex / Mac desktop — cancellation fixture aborted before partial bytes reached disk

- **Status / attribution:** Confirmed test authoring error. No product defect.
- **What failed:** The first summary cancellation test called `cancel()` synchronously from the downloader's progress callback. The stream emitted progress before the buffered chunk reached the file, so the test found a zero-byte `.part` file.
- **Impact:** One focused test run failed; no production files or Git state were affected beyond the uncommitted test change.
- **Correction / remaining risk:** Schedule cancellation shortly after the first progress event so the chunk is written before the abort. The rerun must confirm a non-empty `.part` remains. Low.
