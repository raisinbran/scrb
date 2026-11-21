### A-969 — 2026-11-20 — W10 — Incident content template failed to parse

- **Status / attribution:** Confirmed W10 orchestration error; no GitHub or repository mutation occurred.
- **What failed:** A JavaScript template literal used to prepare A-968 contained Markdown backtick delimiters, so functions.exec rejected the script before executing any API calls.
- **Impact:** The A-968 correction commit was delayed; the branch remained at d95e526 and no source was modified by this failed call.
- **Correction / remaining risk:** Prepare the incident body as an array of plain strings and validate before creating blobs. Low.
