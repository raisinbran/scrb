### A-821 — 2026-11-18 — Codex Desktop / Mac — focused Vitest run blocked by sandbox temp-file access

- **Status / attribution:** Confirmed agent invocation/setup error; no application defect.
- **What failed:** The initial focused Vitest command attempted to create Vite's temporary bundled config files in `.vite-temp` directories under the isolated worktree, where the sandbox denied writes with `EPERM`. Test execution did not start.
- **Impact:** One blocked test invocation and an additional approval step.
- **Correction / remaining risk:** Re-ran only the requested focused test file after approved escalation for its temporary files; all 8 tests passed. No permissions were changed persistently. Low.
