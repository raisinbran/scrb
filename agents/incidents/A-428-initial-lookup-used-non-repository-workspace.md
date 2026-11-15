### A-428 — 2026-11-14 — Codex — initial lookup used the non-repository workspace

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** On the first attempt at the H1 task, I inspected the non-repository workspace, which was not the registered scrb Git repository, and reported that the plan, handoff and repository were unavailable. The project registry already exposed the actual checkout at the repo folder; I did not query it before stopping.
- **Impact:** The user had to repeat the task after connecting the repository, costing an extra turn and delaying the prerequisite check.
- **Correction / remaining risk:** On retry, I queried the registered projects, located scrb, pulled main, and checked the requested files and pins. H1 remains blocked because the two meeting audio files have no SHA-256 pins in the repo fetch script. No corpus files were downloaded. Low.
