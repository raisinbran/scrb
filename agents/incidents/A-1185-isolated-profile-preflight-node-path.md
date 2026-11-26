### A-1185 — 2026-11-17 — Codex / MacBook Air M5 — isolated-profile preflight used Node before adding the configured path
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed agent setup error; no product defect.
- **What failed:** A read-only preflight script called `node` before exporting the repository's configured Node directory, so zsh returned `command not found`.
- **Impact:** One config check did not run. No application or existing user data changed.
- **Correction / remaining risk:** Re-ran the check with `~/.local/share/scrb-node/current/bin` on `PATH`; the helper, live/final assets, and temporary library pointer were present. Low.
