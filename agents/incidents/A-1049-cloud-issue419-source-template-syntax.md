# A-1049 — Cloud GitHub source-authoring template syntax errors (2026-11-22)

- **Effect:** Two proposed GitHub source file creation calls failed locally in the orchestration layer before GitHub mutation; both attempts consumed execution effort, and neither created a partial repository file. A preliminary unauthenticated git remote probe also failed because the execution container lacked DNS access.
- **Attribution:** Self-induced authoring/tool-selection error in this cloud implementation task, not an SRCB application defect.
- **Cause:** Literal PowerShell backticks inside a JavaScript template string were not escaped in two source-authoring calls; this was avoidable. The failed git probe was an unnecessary setup attempt given the available GitHub connector.
- **Correction:** Rewrote the submissions using template-safe source and the connected GitHub file API; created the test and documentation files successfully. GitHub commit identifiers and future exact-head CI are the source of truth.
- **Remaining risk:** No PowerShell runtime is available in the local cloud container. Windows CI and an independent review must validate script syntax, behavior and security controls before merge. Public collision check on main and searchable PRs showed no A-1049; host-private unpublished reservations remain unknown.
- **Privacy/evidence:** The two Code Mode syntax errors and git DNS failure occurred during the task. No installer or private key was created, uploaded or used. Quota impact unavailable; no per-task meter is exposed.
