### A-880 — 2026-11-20 — Codex Desktop — CI diagnostics query included run ID before discovery

- **Status / attribution:** Confirmed tool-call argument error; no repository, CI or workflow state was changed.
- **What failed:** My first read-only call to the pull-request diagnostics tool supplied an Actions run ID before discovering the PR checks. The tool rejected the call and instructed me to discover checks first, then carry its returned head revision into later details.
- **Impact:** One no-op diagnostics call; no CI rerun or repository change occurred.
- **Correction / remaining risk:** I followed the documented sequence and retrieved both job IDs for exact head `df34351075bd9692e127a6819ef181b7ca25f1d9`; Windows and macOS jobs were in progress. Low.
