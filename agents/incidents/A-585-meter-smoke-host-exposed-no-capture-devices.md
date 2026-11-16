### A-585 — 2026-11-16 — Codex / Mac — meter smoke host exposed no capture devices

- **Status / attribution:** Confirmed test-environment limitation; no recording data was produced.
- **What failed:** The isolated helper's `open` returned false after native events reported `no such mic` and `create aggregate: 560947818` for the process-tap meeting track. This helper launch lacked usable microphone and system-audio capture access.
- **Impact:** The invented-tone test could not measure input/output response or verify acoustic independence on this host.
- **Correction / remaining risk:** Preserved `meter-880hz.wav` and `meter-smoke-failure.json` under `/private/tmp/scrb-native-meter-evidence-20261116`; did not retry in the same context. A measurement still requires a Mac capture context with an available microphone and authorized process-tap access. High for the requested latency claim.
