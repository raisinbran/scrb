### A-660 — 2026-11-16 — Codex / BCHEN-W10 — Prettier given plain text license files

- **Observed effect:** The focused Prettier check exited 2 because it could not infer a parser for six `.txt` license files; it also reported formatting changes in the supported TypeScript, JavaScript and Markdown files.
- **Evidence:** `build/focused-checks-final.log` shows the parser errors and formatting warnings.
- **Attribution:** Agent check-command construction error; license text contents were not changed.
- **Correction:** Format only supported `.ts`, `.mjs` and `.md` files, then rerun the focused check.
- **Remaining risk:** None beyond confirming the supported-file formatting.
