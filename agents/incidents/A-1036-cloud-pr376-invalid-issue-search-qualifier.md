### A-1036 — 2026-11-21 — PR #376 cloud reservation audit — invalid read-only GitHub issue search

**Effect:** One GitHub REST issue-search request returned HTTP 422; no repository or device state was modified.

**Cause:** The read-only query omitted GitHub's required `is:issue` or `is:pull-request` qualifier.

**Correction:** Stopped using that malformed REST URL; used the supported structured issue-search connector and directly verified the controlling #358/#409 comments and all open PR incident filenames. No test rerun, source change or privileges were involved.

**Remaining risk:** None to #376 source integrity. An offline machine's unpublished incident reservations remain separately unverified; the public search is not a substitute for local read-only checks.

**Usage impact:** One failed metadata lookup, exact elapsed time/allowance attribution not exposed by the cloud connector.
