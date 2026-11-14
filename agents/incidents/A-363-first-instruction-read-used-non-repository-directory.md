### A-363 — 2026-11-14 — local coding session — first instruction lookup used a notes directory

- **Status / attribution:** Confirmed session error; no application defect.
- **What failed:** My first `AGENTS.md` lookup ran in the current notes directory, which is not the Git repository, and returned “No such file or directory.”
- **Impact:** One failed read and a short delay. No source or user data was changed before I found the repository and read its actual `AGENTS.md`.
- **Correction / remaining risk:** Identified `/Users/brandonchen/Documents/GitHub/scrb` as the repository and read its instructions before inspecting source or making changes. Low.
