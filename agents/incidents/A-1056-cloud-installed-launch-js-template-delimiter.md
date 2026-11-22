### A-1056 — 2026-11-22 — cloud source-readiness implementation — PowerShell line continuation broke source submission

- **Observed error:** The first attempt to submit `scripts/win-installed-app-readiness.psm1` through a JavaScript template failed with `SyntaxError: Unexpected identifier '$close'`.
- **Cause:** An unescaped PowerShell backtick line continuation prematurely terminated a JavaScript template literal in the source-publishing call.
- **Impact:** One failed source-authoring call, **before** any Git write; no application test, GitHub CI or installer action ran.
- **Correction:** Resubmitted the module with no PowerShell backtick inside the JavaScript template, then verified its branch commit and added synthetic behavior checks. Preserve this incident separately from any future CI failure.
- **Remaining risk:** Module startup integration and Windows UI Automation still require exact-head checks and independent review; no genuine installed-app PASS is claimed.
