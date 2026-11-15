### A-521 — 2026-11-15 — Codex / Mac local — npm install lacked repository Node on PATH

- **Status / attribution:** Confirmed agent error; no dependency installation occurred.
- **What failed:** The first `npm ci` invocation through `heavy.sh` exited immediately because npm's `/usr/bin/env node` shebang could not find `node`.
- **Agent-controlled cause:** I invoked the repository npm executable without prepending the repository's documented Node directory to `PATH`.
- **Correction / remaining risk:** Reran with `~/.local/share/scrb-node/current/bin` on `PATH` under `heavy.sh`; `npm ci` installed the lockfile dependencies successfully. The failed invocation made no changes. Low.
