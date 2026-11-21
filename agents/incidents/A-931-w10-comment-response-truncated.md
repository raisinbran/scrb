### A-931 — 2026-11-20 — W10 — Issue-comment fetch produced an oversized response

- **Status / attribution:** Confirmed agent tool-output handling error; no GitHub state changed.
- **What failed:** The first fetch printed every comment body and HTML form for issues #340 and #358, exceeding the useful output budget.
- **Impact:** The response was truncated and obscured the newest assignment details.
- **Correction / remaining risk:** Reused the fetched structured result and printed only the newest required comment excerpts. No additional broad fetch was needed. Low.
