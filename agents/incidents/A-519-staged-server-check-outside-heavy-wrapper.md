### A-519 — 2026-11-15 — Codex / Mac local — staged server check ran outside heavy.sh

- **Status / attribution:** Confirmed agent process error; no persistent process started.
- **What failed:** I invoked the staged `llama-server --version` directly instead of through the repository's required `heavy.sh` wrapper. The launch exited immediately with a dynamic-loader error; it did not load a model or start a server.
- **Agent-controlled cause:** I did not follow the plan's wrapper requirement for this runtime check.
- **Correction / remaining risk:** The final packaged version check and dependency audit passed under `~/scrb-dev-assets/heavy.sh`; no long-running process or model operation was started. Low.
