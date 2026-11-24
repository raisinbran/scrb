### A-1125 — 2026-11-22 — ChatGPT (cloud) and Codex (M5) — malformed incident and usage records merged

- **Agent:** ChatGPT (cloud GitHub connector; A-1011, A-1054, A-1057 files) and Codex (MacBook Air M5; usage row `2026-11-22-m5-isolated-profile-race-fix.md`)
- **Status:** confirmed by `node scripts/check-register-ids.mjs` on main `681cd4e5`.
- **What happened:** three incident files used a `#` heading instead of the required `### A-nnn —` heading, and one usage row lacked its closing pipe (11 columns detected, 12 required). The authors did not run the register check, and CI did not run it (A-1124).
- **Impact:** `npm run check` failed on main for every later local run; these records were invisible to the A-number duplicate check.
- **Correction:** repaired in #459 (heading level and closing pipe only; content unchanged).
- **Remaining risk:** none once CI runs the check.
