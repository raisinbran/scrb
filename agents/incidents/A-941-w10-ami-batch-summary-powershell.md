### A-941 — 2026-11-20 — W10 — AMI batch summary used an invalid PowerShell join expression

- **Status / attribution:** Confirmed agent orchestration error; no model result was altered.
- **What failed:** The first held-out-window batch used `-join` inside a `ForEach-Object` script block, so summary rendering raised a parameter-binding error after the first fixture completed.
- **Impact:** The wrapper was interrupted before the remaining fixtures ran; the first report was retained locally.
- **Correction / remaining risk:** Read the completed report directly and use separate arrays for summary text before resuming the still-unrun fixtures. No completed fixture was repeated. Low.

