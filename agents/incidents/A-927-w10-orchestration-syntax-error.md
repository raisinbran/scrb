### A-927 — 2026-11-20 — W10 — Tool orchestration script had an unescaped template delimiter

- **Status / attribution:** Confirmed agent error; no nested tool call ran.
- **What failed:** A JavaScript orchestration snippet contained an unescaped template delimiter and failed to parse.
- **Impact:** The intended independent tool call was not issued.
- **Correction / remaining risk:** Rewrote the snippet without template interpolation and continued. Low.
