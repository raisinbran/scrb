# Additional cloud-OK tasks 29, 35, 31 — preliminary handoff

**Date:** 2026-10-31 (America/Los_Angeles)  
**Branch:** `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031`  
**Review:** [draft PR #8](https://github.com/raisinbran/scrb/pull/8), QA-only. No merge or push to `main`.

The owner requested continuation of priorities 4–6 rather than waiting for Gate 2 native evidence. Work is limited to independent cloud-compatible tests and the isolated Task 31 downloader described in the existing approved-scope plan. This does **not** approve model sources, new contracts or release.

| Task | Commit | Delivered | Unfinished / needs QA |
| --- | --- | --- | --- |
| 29 — search | `4cf62081` | Deterministic 5,000-row in-memory SQLite search benchmark using the real `Library.search` and SQL row filtering. Requires 50 or fewer invented transcript reads, 50 matching results, and search completion under 2 s. | Not a physical large-library disk benchmark; run in macOS/Windows CI and repeat on installed app if warranted. |
| 35 — accessibility | `56d82e79` | RTL tests for an accessible named dialog, disabled/inert Tab filtering, focus restoration, and labeled menu Home/End/Tab keyboard handling. | Real VoiceOver/Narrator, 200% zoom and actual browser keyboard tests still native. |
| 31 — model setup | `cc295f1d`, `22ed88c1` | Standalone HTTPS-only, streamed staged model downloader with exact size/SHA-256 verification, no redirected provider URLs, abort/partial cleanup and startup-only cleanup for UUID-named scratch. Loopback fake-server tests cover valid, corrupted, chunked oversized, redirect, network interruption, cancellation, invalid HTTP source, simulated TLS failure, and orphan cleanup. | Intentionally **not connected** to `startModelDownload`/renderer UI. Actual immutable URLs, hashes, redistribution rights, native permissions, release packaging and real TLS/provider testing remain owner/Claude decisions. No real models downloaded. |

## Verification boundaries

- **Status as authored:** source committed via connected GitHub, but **no new Windows/macOS CI completion has been observed** for these commits. Do not infer green results from the earlier [PR #8 CI run](https://github.com/raisinbran/scrb/actions/runs/41270424090).
- Direct `git clone` from this execution environment failed DNS resolution of `github.com`. Local `npm ci`, TypeScript, lint, Prettier, Vitest, Playwright and test runtime were **not run**. Claude should run `npm run check`, `npm run test:smoke` and the changed-file Prettier check before QA.
- The model downloader's injected `fetchSource` is only a test seam; production uses global fetch and rejects non-HTTPS source URLs. Fake HTTP-server tests do **not** prove real certificate validation or post-setup network isolation.
- No `packages/contracts/`, capture helper, native device, real recording, transcription, installed model or production downloader UI was changed.
- Keep this preliminary branch draft. If CI finds an exact failure, apply only the smallest fix with a reproducer; do not add new features or overextend gate requirements.
