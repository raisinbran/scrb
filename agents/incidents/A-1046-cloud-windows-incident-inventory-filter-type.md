### A-1046 — 2026-11-21 — Cloud coordinator — Wrong callback type in incident inventory filter
- **Observed failure:** One read-only inspection batch produced three TypeErrors because a regular-expression object was supplied to `Array.filter` as though it were a callback.
- **Cause:** Incorrect JavaScript collection method argument during the remaining three open-PR incident filename checks.
- **Effect:** One failed metadata processing batch; no Git or CI mutation.
- **Correction/evidence:** Re-ran only that bounded three-PR batch with `filter(path => regex.test(path))`; no A-1044–A-1047 collisions were found in those checked PRs.
- **Remaining risk:** Unpublished remote reservations are not accessible from this cloud check; do not claim global CLEAR.
