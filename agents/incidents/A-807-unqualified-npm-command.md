### A-807 — 2026-11-18 — Codex Desktop / MacBook Air M5 — npm command was not on the shell path

- **Status / attribution:** Confirmed command setup error; no repository or application change.
- **What failed:** The first focused validation command called `npm` without the configured Node toolchain path, so the shell could not find it.
- **Impact:** That validation command stopped before running its checks.
- **Correction / remaining risk:** Use the configured absolute toolchain path for Node and npm. Low.
