### A-351 — 2026-11-13 — Codex / Windows PC — stale Scribe process blocked package cleanup

- **Status / attribution:** Confirmed agent setup error; the old app window was left open from the earlier verification. No product-code defect.
- **What failed:** The first authorized packaging attempt hit `Access to the path 'd3dcompiler_47.dll' is denied.` A Scribe process from the prior manual launch was still running from the same `release\win-unpacked` path. After closing the stale window, the single permitted retry succeeded.
- **Impact:** One packaging attempt failed and consumed one allowed retry. The failure prevented the package until the old app process exited.
- **Correction / remaining risk:** Confirm the old packaged app is closed before a rebuild that replaces its output. The current package and E2E spec passed. Low.
