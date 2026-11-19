### A-820 — 2026-11-18 — Codex Desktop / Mac — review dependency setup used npm without its Node path

- **Status / attribution:** Confirmed agent setup error; no repository or application defect.
- **What failed:** The first offline dependency-install command invoked the npm launcher while the repository's documented Node directory was absent from `PATH`. The launcher exited with `env: node: No such file or directory` before installation began.
- **Impact:** One failed setup command and a short delay; no package installation occurred in that attempt.
- **Correction / remaining risk:** Re-ran the same offline, lockfile-based install with the documented Node directory in `PATH`; 568 packages installed from cache with lifecycle scripts disabled. Low.
