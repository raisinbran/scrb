### A-852 — 2026-11-18 — Unverified repository file paths in transcript-jump diagnostic preparation

- **Status and attribution:** Confirmed self-induced read-only source-path lookup errors during the cloud-side investigation/diagnostic test-harness slice. No application or CI defect.
- **Failure:** A grouped GitHub source fetch assumed an unverified transcript-scroll file path and returned NOT_FOUND; two later guessed test filenames were separately reported NOT_FOUND. These paths were not previously confirmed to exist.
- **Cause:** Guessed source/test locations from component names instead of discovering exact filenames first. The GitHub connector rejected the read requests before any mutation.
- **Impact:** Failed read calls and extra source discovery; zero file loss, native execution, CI retry, recording, installation, or production-source modification caused by these lookups. Quota cost not attributable separately.
- **Correction:** Used GitHub code search and the verified existing `apps/desktop/e2e/transcript-jump-performance.spec.ts` as the actual test entry point. Scoped work to one Playwright test and two test-only helper/regression files.
- **Evidence:** This draft branch and the paired one-row task usage file `agents/usage-log/2026-11-18-transcript-jump-diagnostic-cloud.md`. Original failing Mac CI on W2 run 44475497401 and independent diagnostic comment 7002909683 are preserved untouched.
- **Publication:** Draft task branch only until CI and independent formal review; not on `main`. A-852 was not present in the inspected public `main` or current open PR file lists, but unpublished local reservations remain unverified and require reconciliation before merge.
