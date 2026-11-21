# A-1011 — 2026-11-20 — unverified guessed source-path probes in V1 Settings/quit audit

- **Status:** Confirmed minor self-induced read-only lookup failure; corrected during this task.
- **What happened:** Four file reads were attempted using assumed source paths that are not present on the pinned main tree (apps/desktop/src/main/audio-check.ts, apps/desktop/src/main/settings-location.ts, apps/desktop/src/main/main.test.ts, apps/desktop/src/main/mini-state.test.ts). GitHub returned NOT_FOUND for each.
- **Cause:** Guessed filenames before checking the complete repository tree; those guesses were not evidence that the features were absent.
- **Impact:** Four avoidable connector reads. No application, index, private data, physical devices, source files, PR state or tests were changed by the failed queries.
- **Correction:** Used the pinned recursive Git tree and fetched the actual relevant files (mic-check.ts, quit.test.ts, main.ts, SettingsScreen.tsx, backend.ts and related tests). The final audit distinguishes missing *handlers* verified by code search from nonexistent guessed paths.
- **Remaining risk:** None established from these read-only probes. Model effort and quota cost were not measurable on this ChatGPT Chat/GitHub connection; do not infer zero cost.
- **Reference:** Issue #49 and #335 source audit, main 4bb68ee1f16ba4447eaf489517b059c482a87343.
