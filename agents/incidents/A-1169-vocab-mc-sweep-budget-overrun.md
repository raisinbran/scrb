### A-1169 — 2026-11-25 — Claude Code — vocabulary `-mc` sweep ran past the owner's 3-hour decode budget

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. The 3-hour decode-time budget was stated for the task; the estimate written at start was about 3 h, but I added extra runs (nocarry 128, hint-off `-mc 64`) and a third parallel stream without re-checking the total, and the negative-control pass ran longer than estimated.
- **Evidence:** `~/scrb-dev-assets/eval-vocab/s2/sweep/command-log.md`: 208 decodes, 24,234 s summed decode time; wall time about 3 h 39 min (09:45 to 13:24 PST).
- **Impact:** About 40 minutes past the budget; no failed decode, no private data, results complete. Higher shared-account usage than planned.
- **Correction:** Overrun reported in the results note and PR; no further decodes were started after the budget passed.
- **Remaining risk:** Low. Re-estimate and ask before adding runs to an approved budget.
