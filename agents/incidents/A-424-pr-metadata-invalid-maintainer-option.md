### A-424 — 2026-11-15 — Codex — PR metadata update rejected by same-repository option

- **Status / attribution:** Confirmed tool-call error; no PR content was changed by the rejected request.
- **What failed:** The first update to draft PR #292 supplied maintainer_can_modify=true. GitHub rejected that field because this is a same-repository PR.
- **Impact:** One failed metadata update call and a short delay.
- **Correction / remaining risk:** Retried without the optional field; the title and description updated, and PR #292 remains open and draft. No merge occurred. Low.
