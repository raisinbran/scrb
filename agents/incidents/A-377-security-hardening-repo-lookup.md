### A-377 — 2026-11-14 — Codex / Mac desktop — pull request lookup used the wrong repository

- **Status / attribution:** Confirmed agent lookup error; no repository effect.
- **What failed:** The first open-pull-request search used `LE-Digital-Delivery/scrb` before checking the configured `origin` remote, which is `raisinbran/scrb`; GitHub returned a validation error.
- **Impact / evidence:** One failed read-only lookup and avoidable delay.
- **Correction / remaining risk:** Read the remote and repeated the search against `raisinbran/scrb`; no write was attempted. None.
