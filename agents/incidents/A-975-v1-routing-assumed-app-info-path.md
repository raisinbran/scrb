### A-975 — 2026-11-20 — Cloud — Assumed obsolete About implementation path in read-only inspection

- **Status / attribution:** Confirmed self-induced source-lookup mistake during V1 routing research; no source state changed.
- **What failed:** Requested `apps/desktop/src/main/app-info.ts` from current `main` without verifying the path. The repository API returned NOT_FOUND. The implementation location may have changed after earlier PR source snapshots.
- **Impact:** One wasted read call and no incorrect V1 implementation decision; other current-source reads of `TitleBar.tsx`, `use-processing.ts`, `TitleBar.test.tsx`, `AppShell.tsx`, and `quit.ts` succeeded.
- **Correction:** Treat code paths from old PRs as provisional; list filenames or search current tree before fetching them. PR #361 remains a separate existing diff with current-head CI and administration/review gates.
- **Remaining risk:** Low. A-975 checked against published `main` and current open #392/#400 and related reporting branches before publication; unpublished incident reservations on active M5/W10 are unavailable and must be checked at merge.
