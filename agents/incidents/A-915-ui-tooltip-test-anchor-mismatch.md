### A-915 — 2026-11-20 — UI tooltip test edit used an outdated source anchor

- **Classification:** Confirmed self-induced cloud edit-script anchor mismatch; not an app, CI, theme or user-device failure.
- **What failed:** The first exact-string insertion for a Tooltip regression expected the prior test title `hides on leave and stays hidden until another entry`. The file's current corrected test actually read `hides immediately on leave and stays hidden until another entry`. The tool's fail-closed anchor check rejected the operation before changing the GitHub file.
- **Impact:** One rejected cloud editing call and avoidable delay. No source/PR state was changed by the rejected attempt.
- **Correction:** Re-fetched the actual branch file, matched its current exact test title, then added the accessible-description regression on the next valid commit. Keep future file-edit anchor checks and inspect the live revision after preceding edits.
- **Publication:** This separate, unmerged UI PR branch only. Identifier provisional until all active and locally unpublished reservations are reconciled; no separate W10/Mac incident was modified.
