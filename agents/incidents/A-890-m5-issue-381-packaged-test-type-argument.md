### A-890 — 2026-11-20 — Codex Desktop — Packaged regression omitted a required IPC argument

- **Status / attribution:** Confirmed test-author error; caught by TypeScript before execution.
- **What failed:** The new packaged test called `invoke('getSettings')` without the contract-required second argument.
- **Impact:** The first standard check stopped during desktop typechecking.
- **Correction / remaining risk:** Passed `undefined` explicitly, then reran the full standard check successfully. Low.
