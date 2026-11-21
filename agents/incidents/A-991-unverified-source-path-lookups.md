### A-991 — 2026-11-20 — Cloud — Two guessed source paths caused avoidable 404s during safety audit

- **Attribution:** Confirmed self-induced read-only lookup errors. The review tried `packages/storage/src/location.ts` and `apps/desktop/src/ui/shell/use-processing.test.tsx` on current `main` without confirming those filenames.
- **Evidence:** Both GitHub source reads returned NOT_FOUND. The correct storage location reader is in `packages/storage/src/library.ts`; processing state tests are in `apps/desktop/src/ui/shell/TitleBar.test.tsx`. Subsequent targeted reads established the relevant code.
- **Impact:** Two unnecessary connector calls; no repository mutation, private data exposure, CI retry, or failed runtime test.
- **Correction:** Switched to repository search followed by verified file-path reads; no user-visible diagnosis relied on the failed guesses.
- **Remaining risk:** Low; future changed-path lookups must search/list before reading. Identifier checked against current GitHub main/open task PRs; independent unpublished reservations remain unknown.
