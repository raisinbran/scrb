### A-893 — 2026-11-20 — W10 — invalid PowerShell file glob in source lookup

- **What failed:** A source lookup passed the Bash-style `scripts/*.test.mjs` pattern directly to `rg` from PowerShell, where that path syntax is invalid.
- **Impact:** The lookup returned an error and no files; no source or test was changed.
- **Correction / remaining risk:** The previous exact-path search already identified the required references. Low.
