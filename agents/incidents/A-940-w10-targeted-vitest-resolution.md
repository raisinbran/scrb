### A-940 — 2026-11-20 — W10 — Focused Vitest invocation could not resolve worktree dependencies

- **Status / attribution:** Confirmed environment/setup error; no test assertion ran and no source state changed.
- **What failed:** Invoking the original checkout's Vitest binary from this clean worktree failed while loading `vitest.config.ts`: this worktree has no `node_modules`, so `vitest/config` was not resolvable from its project root.
- **Impact:** The new focused unit test did not execute locally.
- **Correction / remaining risk:** The negative-ID runner guard passed locally; the new unit test remains for exact-head CI on the supported clean install. No additional local retry was made. Low.

