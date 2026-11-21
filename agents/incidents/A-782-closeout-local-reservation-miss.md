### A-782 — 2026-11-18 — cloud coordination — Published provisional incident IDs before checking unpublished reservations

- **Status / attribution:** Confirmed preventable numbering/coordination error during the three-PR closeout; no application or user-data change.
- **What happened:** A remote branch scan found A-774 and A-775 unused on published main/open PRs. Initial bookkeeping commits put the Help incident at A-774 (PR #362) and Title Bar formatter incident at A-775 (PR #360) before checking earlier handoffs that reserved these IDs for unpublished local diagnostic records. This could have caused a merge collision and unnecessarily triggered CI on superseded documentation heads.
- **Source evidence:** Initial bookkeeping commits dbb741dfe and 5e87db650, previous project handoff references to Regiurn's unpublished A-774/A-775 and later A-778/A-779, and the subsequent PR #362 correction to A-780.
- **Cause:** Incomplete incident reservation scan: treated absence from the public GitHub tree as sufficient and consulted prior local handoff context too late.
- **Correction:** Preserve original failure evidence, move Help incident to A-780 and Title Bar incident to A-781, updating incident filenames, headings, usage references and PR descriptions before merge. Do not change application code.
- **Prevention:** Check main, every accessible open PR, and documented unpublished local reservations before allocating incident numbers; use a lease-guarded branch update.
- **Remaining risk:** Unpublished local worktrees cannot be directly inspected from this cloud session; the last local reservation snapshot may be incomplete. Separate-session independent review and exact-head CI remain required.
