### A-554 — 2026-11-15 — Codex / model unavailable / Mac local — match-media test stub scoped to one integration group

- **Status / attribution:** Confirmed test-harness correction error; no application defect.
- **What failed:** The correction for A-553 placed the `matchMedia` stub inside only the first of three nested App integration groups. The next focused rerun still failed six tests in the other groups when `ThemeProvider` mounted.
- **Impact:** One focused rerun failed in six integration cases before assertions; product code was unaffected.
- **Correction / remaining risk:** Moved the stub and global restoration to file-level hooks so all App integration groups receive it. Low.
