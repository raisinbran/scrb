### A-1000 — 2026-11-20 — ChatGPT Chat — CI correction drafting matched an outdated test anchor

- **Status / attribution:** Confirmed self-induced preparation error; no GitHub source write was made by the rejected edit.
- **What failed:** The first in-memory exact-string transformation of `speakers-layout-and-chrome.spec.ts` did not match the actual indentation/whitespace of the test's Settings tooltip assertion and refused to continue.
- **Impact:** One no-op preparation failure and re-read. No code was lost, no existing source/PR state mutated, and no CI run was triggered by the failure.
- **Correction:** Re-fetch the exact current file and verify a unique anchor before generating the commit. Subsequent `48d2b62a` and `3eb33972` commits were applied to PR #383; final Windows/macOS CI #44820947536 passed.
- **Remaining risk / publication:** Low; original failure preserved in the coordinator task account. This incident is staged on a separate unreviewed cloud accounting branch, not merged. Unique against current main and checked open PR file lists; unknown unpublished local reservations are not asserted absent.
