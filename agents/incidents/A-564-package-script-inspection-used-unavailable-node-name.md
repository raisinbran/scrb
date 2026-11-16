### A-564 — 2026-11-15 — Codex / Mac desktop — package script inspection used unavailable `node` command

- **Status / attribution:** Confirmed task setup error; no script or test ran.
- **What failed:** I queried the root package scripts with `node -e ...`, but the managed shell `PATH` did not include the repository-pinned Node installation.
- **Impact:** The inspection command exited immediately with `command not found`; no repository files or running Scribe process were affected.
- **Correction / remaining risk:** Repeated the read-only query using `/Users/brandonchen/.local/share/scrb-node/current/bin/node`; later boundary and register checks passed with the pinned runtime. Low.
