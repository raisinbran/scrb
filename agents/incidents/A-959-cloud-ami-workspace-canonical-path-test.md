### A-959 — 2026-11-20 — AMI workspace test compared lexical rather than canonical tool root

- **Status / attribution:** Confirmed agent-authored test-fixture error, not evidence of scratch-path escape, real data deletion, or application corruption.
- **What failed:** The new macOS script test expected the isolated run directory to start with the lexical temporary fixture path. The workspace code resolves the tool root through realpath before creating an exclusive child. On macOS those pathname representations can differ, so the initial test failed at line 78 even though the generated directory remained beneath the canonical tool root.
- **Evidence:** PR #392 CI run 44858251939, macOS Test failure at scripts/ami-remote-workspace.test.mjs:78. The same run separately showed the negative paired-comparator assertion mismatch already documented under A-958; do not conflate them.
- **Cause:** The assertion omitted source-directory canonicalization even though that is a deliberate path-safety invariant.
- **Correction:** Compare the runRoot prefix with workspace.toolRoot (the actual realpath-resolved trusted root), retaining the strict child and sibling-preservation checks. Do not relax containment, add filesystem permissions or change the production helper.
- **Impact:** One additional failed macOS CI on a superseded head, with no device/model inference and no data-loss event. Existing historical CI evidence is preserved; exact-head checks still required.
- **Remaining risk:** Independent review and new head CI must verify the corrected negative-path suite. No automatic rerun of unchanged failed code was requested.
