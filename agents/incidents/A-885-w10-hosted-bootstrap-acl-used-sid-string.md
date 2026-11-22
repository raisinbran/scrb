### A-885 — 2026-11-20 — W10 — hosted bootstrap passed the SID string to the ACL rule constructor

- **Status / attribution:** Confirmed bootstrap implementation error; no application defect.
- **What failed:** The second hosted Windows smoke run created the temporary local account but could not set its scratch-directory ACL because the ACL constructor could not translate the SID string supplied as its identity argument.
- **Impact:** The behavioral child process did not start, so hosted standard-user identity and guard behavior were not verified. The disposable GitHub runner was destroyed after the failed job. No installer was downloaded or run, and no owner profile or recording was accessed.
- **Correction / remaining risk:** Convert the account SID to a `SecurityIdentifier` object before constructing the ACL rule. A fresh exact-head CI run is required to verify the fix. Low pending that run.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

