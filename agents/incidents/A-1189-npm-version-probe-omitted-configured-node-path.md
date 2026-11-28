### A-1189 — 2026-11-18 — Codex / MacBook Air M5 — npm version probe omitted the configured Node path
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed agent environment setup error; no application defect.
- **What failed:** I invoked the configured `npm` executable by absolute path without adding its sibling Node directory to `PATH`. Its `env node` shebang failed with `node: No such file or directory`.
- **Impact:** One version probe failed before running npm work. No install, build, lockfile change or app launch occurred.
- **Correction / remaining risk:** Re-ran the version probe with `~/.local/share/scrb-node/current/bin` prepended and obtained npm 10.9.9. Low.
