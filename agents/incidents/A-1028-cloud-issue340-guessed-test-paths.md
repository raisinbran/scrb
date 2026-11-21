### A-1028 — 2026-11-21 — Cloud issue #340 source triage guessed nonexistent test paths

- Observed self-induced failure: Two guessed test paths (`packages/transcription/test/finalPass.test.ts` and `packages/app-core/test/final-pass.test.ts`) returned NOT_FOUND because file discovery was not completed first.
- Mechanism: Assumed conventional names instead of using the repository index; no code, security, recording or test was affected.
- Effect: Two unnecessary read-only GitHub calls. No quota cost can be isolated from the shared account.
- Correction: Queried code search for exact exported functions and read existing `packages/transcription/test/speakers.test.ts` and `packages/storage/test/corrections.test.ts` instead.
- Prevention: Search repository filenames/functions before selecting paths. Do not classify the 404 responses as source defects.
- Publication: Open accounting-only draft PR; checked no A-1028 in accessible current main/open PR filename inventories. Unpublished local reservations are unknown.
