### A-409 — 2026-11-15 — Mac — export, voice-preview and summaries plans: usage not read at start, wrong tool on PATH

- **Status / attribution:** Confirmed agent errors; no production files affected.
- **What failed:** (1) I did not read allowance usage before starting the task, so the usage row has no start figures. (2) I ran `npx prettier` without the project Node on PATH and got `command not found: npx`.
- **Impact:** The allowance cost of this task cannot be separated from other sessions' use. The command error cost one retry.
- **Correction / remaining risk:** End usage was read and recorded; Prettier was re-run from `node_modules/.bin` with the project Node path. Low.
