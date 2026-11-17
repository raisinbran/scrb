### A-709 — 2026-11-16 — Codex desktop — register check command missed configured Node path
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** After renumbering the incident records, the first register/boundary check invocation used `npm` before adding the configured Scribe Node directory to `PATH`; the shell returned `command not found`.
- **Impact:** One failed command launch; no checks ran and no product files changed.
- **Correction / remaining risk:** Added `/Users/brandonchen/.local/share/scrb-node/current/bin` to `PATH` and reran both checks successfully. Low.
