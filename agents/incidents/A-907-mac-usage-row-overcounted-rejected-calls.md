### A-907 — 2026-11-20 — Codex Desktop — Local usage draft overstated rejected call count

- **Status / attribution:** Confirmed reporting error caught before publication; no public accounting or PR claim was affected.
- **What failed:** The first local draft of this task's 12-column usage row said there were three rejected tool calls, but the observed evidence supports two rejected calls: one diagnostics-query argument error and one invalid permission-prompt field. The denied Git index write is counted separately.
- **Impact:** One inaccurate count remained in the local, unpublished row until final review.
- **Correction / remaining risk:** I corrected the count to two and first assigned this incident A-885 after checking current main, all open PR file lists, and known reservation notes. For this separate staging branch, I remapped it A-885→A-907 after confirming the new reservation. Low.
