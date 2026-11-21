### A-953 — 2026-11-20 — Codex Desktop — Packaged regression omitted a required IPC argument

- **Status / attribution:** Confirmed test-author error; caught by TypeScript before execution.
- **What failed:** The new packaged test called `invoke('getSettings')` without the contract-required second argument.
- **Impact:** The first standard check stopped during desktop typechecking.
- **Correction / remaining risk:** Passed `undefined` explicitly, then reran the full standard check successfully. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-890 was reassigned to A-953 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
