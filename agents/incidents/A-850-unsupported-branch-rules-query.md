### A-850 — 2026-11-18 — Unsupported GitHub branch-rules fetch

- **Status / attribution:** Confirmed coordinator-caused read-only GitHub lookup error while checking merge prerequisites; not a repository defect.
- **What happened:** Requested `https://api.github.com/repos/raisinbran/scrb/rules/branches/main` through the GitHub connector although it does not support that constructed endpoint; returned INVALID_ARGUMENT / HTTP 400.
- **Effect:** One failed metadata lookup and avoidable call. No branch, PR, CI, application or user data was altered. No quota cost can be attributed to the call.
- **Correction:** Stopped unsupported endpoint probing; used supported PR mergeability, exact-head CI, formal reviews and expected-SHA merge API instead. The final #368 and #369 merges succeeded.
- **Publication:** Provisional coordination branch only, not main. Reconcile with all current published and unpublished reservations before merging this reporting file; issue #358 remains open.
