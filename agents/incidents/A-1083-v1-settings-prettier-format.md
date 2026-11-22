### A-1083 — 2026-11-22 — PR #436 cloud UI source formatting failed CI

- **Attribution:** Self-induced nonconformance with repository Prettier style in the first PR #436 source commit, not an application runtime defect.
- **Observed:** Exact-head CI run [#45051388059](https://github.com/raisinbran/scrb/actions/runs/45051388059) failed **Check Prettier on changed TypeScript** on Windows and macOS. The native Windows capture-source build passed. The Prettier-provided diff identified three changed files: model-download.test.tsx, screens.test.tsx and ModelsSection.tsx. Application unit/type/build jobs were not reached; do **not** claim those jobs passed.
- **Effect:** One CI failure with automatic source-correction iteration; no native/installed-app run or private media usage.
- **Correction:** Applied the exact line wrapping and trailing-blank-line adjustments shown in the CI job's Prettier diff, with no intended behavior changes. The revised head requires fresh exact-head CI before independent formal review.
- **Prevention:** Before publishing another cloud-authored source edit, compare its formatting against the repository's Prettier check or run that focused check when an executable source environment is available; avoid broad CI re-runs when the failure is confined to formatting.
- **Incident reservation:** No A-1083 appeared in current main or the recently opened related PR changed paths checked. Unpublished/local reservations remain unverified; reconcile a later-discovered distinct collision through #358.
