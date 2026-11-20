### A-889 — 2026-11-20 — W10 — approval prompt used an unsupported field

- **Status / attribution:** Confirmed tool-argument error; the prompt was rejected before reaching the user.
- **What failed:** The coordinator supplied a `question` field to the asynchronous input tool, whose schema accepts only `title` and `options` for each prompt.
- **Impact:** One failed approval-prompt attempt; no user input was requested and no repository state changed.
- **Correction / remaining risk:** Resubmitted both decisions using the supported title/options schema. The owner authorized one reporting-correction CI run and asked W10 to proceed with the recommended secure artifact path; private channel provisioning remains unavailable through the connected tools. Low.
- **Publication:** Included in PR #376's current reporting-correction commit; unmerged.

