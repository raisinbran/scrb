### A-849 — 2026-11-18 — Requested a GitHub commit status for an invalid guessed reference

- **Status / attribution:** Confirmed self-induced, read-only connector lookup error during independent PR #368/#369/#370 review; not a GitHub, application, or CI fault.
- **What failed:** A parallel metadata lookup mapped known hashes for #368/#369 but erroneously supplied the literal string `invalid` for PR #370 to `get_commit_combined_status` before fetching #370's actual HEAD. GitHub returned 404 `Ref not found`.
- **Cause:** Incomplete PR-number-to-SHA map plus an inappropriate fallback value instead of reading the PR head first.
- **Impact:** One unnecessary failed read; no branch, reviewer, pipeline, files, host state, or user data changed. No CI rerun was triggered. Credited quota cost cannot be isolated.
- **Correction:** Fetched PR #370's current `head_sha=3aad5742f0a07dc19320f56f1f4df356e449b2e0`, then fetched its actual exact-head workflow result and job statuses. No retry against the fabricated reference.
- **Evidence:** Current cloud task's GitHub 404 result; PR #370 and run 44451445757; related task row `agents/usage-log/2026-11-18-m1-pr-review-coordination.md`.
- **Publication:** Provisional on unmerged coordination branch `rosmont/m1-packaging-coordination-20261118`, not `main`; reconcile with unpublished local reservations before merging any accounting PR, and keep issue #358 open.

- **ID reconciliation:** Previously reserved under A-821 on an unmerged coordination-only branch. Renumbered to A-849 because merged Mac PR #369 owns A-821 for an unrelated event. Original commit remains in Git history.
