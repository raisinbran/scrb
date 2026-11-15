### A-518 — 2026-11-15 — Codex / Mac desktop — focused test command did not use the repository Node path

- **Status / attribution:** Confirmed agent setup error; no test ran and no application defect was involved.
- **What failed:** The first focused-test invocation used `npm` from the shell `PATH`, where it was unavailable. A retry with the absolute npm symlink also failed because its `#!/usr/bin/env node` could not find Node on `PATH`.
- **Impact:** Two no-op command attempts before the targeted test.
- **Correction / remaining risk:** Add `/Users/brandonchen/.local/share/scrb-node/current/bin` to `PATH`; the focused test then passed. Low.
