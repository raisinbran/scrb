### A-1126 — 2026-11-18 to 2026-11-22 — ChatGPT (cloud) — M1 plan scope grew around agent tooling limits

- **Agent:** ChatGPT (cloud GitHub connector; author of the M1 installed-delivery plan v2.0–v2.2, PR #367 usage row)
- **Status:** confirmed as a planning judgment by the 2026-11-23 review; the owner approved a simpler route (plan decisions O1, O2).
- **What happened:** the M1 plan, meant to deliver a usable installed app for real meetings soon, was expanded into a single three-computer freeze with hosted zero-upload Windows installer workflows, ten-condition dispatch guards and encrypted transfer. Much of this existed to work around Codex's sandbox, GUI and dispatch limits rather than product needs.
- **Impact:** a week of planning, workflow, accounting and review effort produced no installed run on any computer; the one owner-authorized hosted run was skipped at its guard.
- **Correction:** `dev-plan/m1-v1-path-forward-20261123.md` (Mac first, local Windows installer build) approved by the owner on 2026-11-23; allocation proposal requires Claude review of plans that change M1/V1 scope.
- **Remaining risk:** the hosted workflows remain in `.github/workflows/` (manual-only); park or remove them once the local route works.
