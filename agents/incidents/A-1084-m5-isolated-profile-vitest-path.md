### A-1084 — 2026-11-22 — M5 isolated-profile startup guard — Vitest source-path regression

- **What failed:** The new startup-wiring regression used `new URL('./main.ts', import.meta.url)`. Vitest supplies a non-`file:` module URL, so the test threw `ERR_INVALID_URL_SCHEME` on both macOS and Windows CI.
- **Attribution / impact:** Confirmed test-authoring error; exact-head checks failed in the new test only. No app was launched and no user data was accessed.
- **Correction:** Switched to the established `path.join(__dirname, 'main.ts')` pattern already used by neighboring main-process tests. The corrected test passed in exact-head CI run 45069152411 on macOS and Windows.
- **Remaining risk:** The code head passed CI and independent review found no actionable issues. The PR remains draft; no merge or app launch is authorized.
