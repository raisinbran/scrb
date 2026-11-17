### A-582 — 2026-11-16 — Codex / Mac — npm invoked without the configured Node path

- **Status / attribution:** Confirmed agent setup error; no repository state changed.
- **What failed:** Invoking npm directly used its `env node` shebang before the owner's Node directory was on `PATH`.
- **Impact:** The version lookup failed before any package command ran.
- **Correction / remaining risk:** Added the configured Node directory to `PATH` for subsequent commands. Low.
