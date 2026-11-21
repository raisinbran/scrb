### A-792 — 2026-11-18 — search included historical result logs

- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** A recursive text search under `native/windows-capture` included its `results` subtree and printed historical test-log excerpts in the local terminal.
- **Impact:** The search was broader than needed and surfaced private-context excerpts locally. No recording or transcript was opened, copied into a file, or published.
- **Correction / remaining risk:** Stopped searching `results`; limited follow-up inspection to known source/build paths. Low; the terminal output remains local to this session.
