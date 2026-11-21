### A-788 — 2026-11-18 — Incorrect PR branch name in documentation update

- **Status / attribution:** Confirmed self-induced GitHub write orchestration error during the November 18 M1 A0 coordination and PR #367 documentation corrections. No application or repository defect.
- **What failed:** The first attempted `update_file` for PR #367 addressed `rosmont/m1-installed-delivery-handoff-20261118`, an assumed branch name, instead of the actual `rosmont/m1-installed-delivery-session-handoff-20261118`. GitHub returned 404 Branch not found, before changing any file.
- **Cause:** Inferred the branch name from the document title instead of reading the PR's `head` field first.
- **Impact:** One rejected write attempt and an additional GitHub lookup; no content loss, force push, main update, physical test or CI rerun. Actual quota cost unavailable.
- **Correction:** Read PR #367's actual head, refetched both file SHAs, and committed the two narrow documentary authorization/provenance corrections to that exact branch. No repeated attempt to the wrong branch.
- **Evidence:** PR #367 before/after head SHA `d6e93e7577ece0517d4d8148b2f86747b248e20d` -> `13c925c478b50ff9abdee59b064017a877cd5d22`; coordinator issue #340 comment 6993657203; related task row `agents/usage-log/2026-11-18-m1-a0-coordination.md`.
- **Remaining risk:** Publication of this incident is PR-only until CI and review/merge gates pass. A-788 must be reconciled against unpublished machine-local incident reservations before main publication; don't silently overwrite another event.
