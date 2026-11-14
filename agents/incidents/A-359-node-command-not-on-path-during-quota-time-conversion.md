### A-359 — 2026-11-14 — Codex — Node command not on PATH during quota time conversion

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I used `node -e` to convert quota reset timestamps even though the repository instructions say the owner's Node binary is under `~/.local/share/scrb-node/current/bin`; the shell did not have `node` on PATH.
- **Impact:** One failed shell command and a short delay; no repository or user-data effect.
- **Correction / remaining risk:** Converted the timestamps in the available JavaScript runtime instead. None.
