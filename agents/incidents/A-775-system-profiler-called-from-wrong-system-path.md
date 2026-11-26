### A-775 — 2026-11-17 — Codex / MacBook Air M5 — first host audio inventory used the wrong system_profiler path

- **Status / attribution:** Confirmed agent command-path error; no product defect.
- **What failed:** I first invoked `/usr/bin/system_profiler`, but the macOS utility is at `/usr/sbin/system_profiler`.
- **Impact:** One read-only device inventory attempt returned command-not-found. No permissions, devices, app state, or files were changed by that attempt.
- **Correction / remaining risk:** Re-ran using `/usr/sbin/system_profiler`; its audio inventory was empty in this shell environment. The separate helper and I/O Registry checks were also empty, so host-desktop microphone availability remains unverified here. Low.
