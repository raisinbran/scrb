### A-1163 — 2026-11-25 — Mac — Stage 2 term-selection script bug and two selection passes

- **Agent:** Claude (Sonnet 5.5, Mac)
- **Attribution:** Confirmed self-induced. `vocab_stage2.py select` compared tuples with lists, so the first run found 0 eligible terms; a second run produced fragments and number words, so the rule was tightened and a third pass run.
- **Evidence:** select output on the retained hint-off decodes (all before any hint-on decode).
- **Impact:** Three selection passes (seconds each); no decode was wasted or rerun. The final rule was frozen before any hint-on run.
- **Correction:** Fixed the type bug, added dictionary, number and contraction filters, documented in the results note. Remaining risk: low; the term sets are mechanical and chosen after seeing hint-off output.
