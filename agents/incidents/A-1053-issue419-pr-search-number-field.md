### A-1053 — 2026-11-22 — PR inventory used the wrong search field

- **Status and attribution:** Confirmed self-induced read-only response interpretation error during public incident-ID collision verification; no repository defect.
- **Observed failure:** The first search-result inventory tried the absent `number` property and printed 39 null PR identifiers. The connector returns `issue_number` for these search records.
- **Effect:** One unhelpful diagnostic response, with no Git ref, PR, CI, device, recording or secret changed.
- **Correction:** Inspected the returned schema, selected `issue_number`, and successfully checked the changed-file incident inventories of all 39 then-open PRs in bounded batches. No current published A-1052 or A-1053 collision was found.
- **Prevention:** Inspect one connector result shape before deriving identifiers for batch calls; retain exact observed field names and retry only the corrected bounded inventory once.
- **ID / visibility:** Current public main and the 39 open PR path inventories had no A-1053 at the check. Host-local unpublished reservations remain unverified; cross-machine reconciliation follows issue #358.
