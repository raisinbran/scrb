### A-793 — 2026-11-18 — embedded Opus Git ownership check

- **Status / attribution:** Confirmed agent error; no repository impact.
- **What failed:** A read-only `git` inspection of the embedded Opus checkout initially stopped on Git's dubious-ownership guard.
- **Impact:** The revision check did not run on the first attempt; no metadata or source was modified.
- **Correction / remaining risk:** Repeated the read with a command-scoped `safe.directory` override and confirmed the pinned commit. Low.
