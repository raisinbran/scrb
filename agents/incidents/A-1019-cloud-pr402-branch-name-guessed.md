### A-1019 — 2026-11-21 — cloud GitHub — first attempted file write assumed nonexistent PR branch

- **Failure and attribution:** An initial repository write attempted nonexistent branch cod/cloud-hosted-installer-20261121 rather than first reading PR #402's actual branch. GitHub returned 404 before committing anything. This was a self-induced branch-selection error, not an installer or CI failure.
- **Observed effect:** One rejected tool call; no repository files, PR head, artifacts, devices or recordings changed by it.
- **Correction:** Retrieved current PR metadata and verified the actual branch rosmont/w10-hosted-installer-build-smoke-20261121 at initial head b84c16888bb1b54345107eaf6075b168bf23965b. Subsequent changes were assembled as unattached Git blobs for one checked atomic commit.
- **Prevention:** Resolve exact head branch and SHA before any write; never guess the target from a workstream name.
- **Remaining risk:** None from the rejected operation. Real trusted hosted source-building and installer acceptance remain pending. ID subject to published/unpublished reservation reconciliation before merge.
