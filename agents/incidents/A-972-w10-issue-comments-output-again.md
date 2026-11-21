### A-972 — 2026-11-20 — W10 — Full issue-comment fetch again exceeded useful output budget

- **Status / attribution:** Confirmed repeated agent tool-output handling error; no GitHub state changed by the read itself.
- **What failed:** The full issue-comments connector response for issue #340 was printed instead of narrowing to the assigned comment, producing a very large truncated tool result. A prior occurrence is recorded as A-931.
- **Impact:** The response obscured surrounding status and wasted processing; the supplied latest assignment was still present in the returned content.
- **Correction / remaining risk:** Stopped broad comment reads and used focused PR and workflow APIs for the remaining status checks. Low.
