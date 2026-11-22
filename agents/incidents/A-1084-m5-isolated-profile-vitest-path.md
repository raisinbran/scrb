### A-1084 — 2026-11-22 — M5 isolated-profile startup guard — Vitest source-path regression

- **What failed:** The new startup-wiring regression used `new URL('./main.ts', import.meta.url)`. Vitest supplies a non-`file:` module URL, so the test threw `ERR_INVALID_URL_SCHEME` on both macOS and Windows CI.
- **Attribution / impact:** Confirmed test-authoring error; exact-head checks failed in the new test only. No app was launched and no user data was accessed.
- **Correction:** Switched to the established `path.join(__dirname, 'main.ts')` pattern already used by neighboring main-process tests. A separate Node harness rechecked guard behavior and wiring; the corrected Vitest regression itself is pending exact-head CI.
- **Remaining risk:** The corrected full CI result is pending; no merge or app launch is authorized by this incident.
