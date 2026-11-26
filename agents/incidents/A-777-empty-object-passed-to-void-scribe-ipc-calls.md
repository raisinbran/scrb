### A-777 — 2026-11-17 — Codex / MacBook Air M5 — empty request object rejected by void Scribe IPC calls

- **Status / attribution:** Confirmed agent IPC-call-shape error; no product defect.
- **What failed:** The read-only Phase A script passed `{}` to `getSettings`, `getSetupStatus`, `listInputDevices`, and `listMeetingApps`, which accept no request. The backend rejected those calls with `invalidRequest`.
- **Impact:** Runtime library path, app microphone permission state, and device/source lists were not obtained from that app launch. No settings, recording, import, or processing action succeeded.
- **Correction / remaining risk:** Retry with the request omitted (`undefined`) after the Mac is unlocked. No such retry was made after the Mac locked again. Low.
