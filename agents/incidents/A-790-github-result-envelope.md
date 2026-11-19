### A-790 — 2026-11-18 — GitHub result envelope parsed incorrectly

- **Status / attribution:** Confirmed agent error; no repository or application impact.
- **What failed:** A GitHub connector response was first passed to `JSON.parse` as though its text block contained the requested payload. It contained only a generic completion message; the requested data was in `structuredContent`.
- **Impact:** One lookup failed and required a corrected read. No data was changed or published.
- **Correction / remaining risk:** Read the structured result directly and verify the selected object before using it. Low.
