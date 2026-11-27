# A-1136 — 2026-11-24 — review disposition terminology correction

- **Failure:** The previous independent reviews of PRs #471 and #473 used CHANGES REQUIRED instead of the owner's required binary status REJECTED. Although the source disposition was unambiguous, the terminology did not comply with the requested review convention.
- **Impact:** Owner had to request the status correction. No source code, CI result, or technical finding changed.
- **Correction:** Rechecked both unchanged exact heads and all three successful required CI jobs. Published formal COMMENT reviews headed **REJECTED**: [#471](https://github.com/raisinbran/scrb/pull/471#pullrequestreview-6045269737) and [#473](https://github.com/raisinbran/scrb/pull/473#pullrequestreview-6045270853). Earlier detailed findings are preserved.
- **Prevention:** Every completed formal independent review must explicitly use APPROVED or REJECTED. When exact-head CI is not green, withhold the formal disposition rather than substituting a premature rejection. Use native GitHub COMMENT when the connected identity cannot submit APPROVE/REQUEST_CHANGES.
