### A-886 — 2026-11-20 — W10 — bootstrap cleanup did not verify local account removal

- **Status / attribution:** Confirmed implementation deficiency identified by independent review; no production application defect.
- **What failed:** The hosted bootstrap suppressed errors from `Remove-LocalUser` and did not verify that the temporary account was absent afterward. A profile cleanup error could also exit the `finally` block before scratch cleanup and secure-password disposal.
- **Impact:** The script could report success with a leftover test account if account removal failed. In the observed successful hosted run, the account/profile cleanup path completed; this was a latent failure path, not an observed leftover account. No installer or recording was involved.
- **Correction / remaining risk:** Cleanup now verifies that account and profile removal succeeded, attempts scratch cleanup independently, disposes the secure password, and fails the job if any cleanup step fails. Fresh exact-head CI and independent review are required. Low pending those checks.
- **Publication:** Included in the W10 smoke-test correction PR; local and unpublished until that PR update is reviewed and merged.

