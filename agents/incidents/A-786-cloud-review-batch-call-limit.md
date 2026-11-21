### A-786 — 2026-11-18 — Queue review: oversized GitHub connector batch rejected

- **Status / attribution:** Confirmed minor self-induced tool-orchestration failure during the multi-PR reporting and review task; no repository or product defect.
- **What failed:** The first combined review-inventory request attempted 21 GitHub actions in one orchestration call (seven PRs multiplied by three actions), exceeding that call's maximum. The batch was rejected with a tool-call-limit error before an inventory result could be used.
- **Cause:** Did not bound the connector fan-out to the tool's supported call count.
- **Impact:** One preventable rejected tool invocation and an additional diagnostic turn. No Git write, CI run, branch change, recording, private data access or merge was caused by the error. Actual per-task quota cost cannot be attributed from ChatGPT's unavailable percentage meter.
- **Correction:** Retried using small, purpose-specific seven-call batches; current PR heads, CI and review states were then retrieved successfully. Did not retry successful CI or duplicate existing formal reviews.
- **Evidence:** The current task's connector error and corrected request sequence; queue-closeout usage file `agents/usage-log/2026-11-18-pr-queue-closeout.md`.
- **Remaining risk:** Low; A-786 is unique among the inspected current main/open-PR incident filenames, but unpublished Mac/Regiurn reservations must be checked again before merge. Keep issue #358 open.
