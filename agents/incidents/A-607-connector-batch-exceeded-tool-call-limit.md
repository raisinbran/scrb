### A-607 — 2026-11-16 — ChatGPT Chat / cloud connector — incident renumbering batch exceeded call limit

- **Status / attribution:** Confirmed task-orchestration mistake, corrected by using smaller batches; no application defect.
- **What failed:** The first repository-object staging call for PR #326 combined too many GitHub connector operations and was rejected with `Code Mode exceeded the maximum number of tool calls`.
- **Impact:** No PR branch ref was updated; the original head was independently confirmed unchanged. Some unreferenced blobs may have been created. One avoidable failed operation; separate quota cost unavailable.
- **Correction / remaining risk:** Split the file reads and blob writes into small batches, checked incident names and usage references, then publish one docs-only commit. Fresh exact-head CI and review remain the merge gates. Low.
