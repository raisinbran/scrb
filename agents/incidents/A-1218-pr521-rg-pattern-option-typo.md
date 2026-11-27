### A-1218 — 2026-11-27 — Codex — ripgrep treated a search pattern as an option

- **Agent:** Codex (model unavailable; Mac Codex desktop; Medium requested)
- **Status / attribution:** Confirmed command typo; no repository or product change.
- **What failed:** I passed a search pattern beginning with `--` to `rg` without the `--` option terminator. Ripgrep rejected it as an unrecognized flag.
- **Impact and evidence:** One source search returned `rg: unrecognized flag --color-surface-hover|color-surface-hover`; the search succeeded with `rg --` on the next inspection.
- **Correction / remaining risk:** Used the option terminator for the subsequent source search. Low.
