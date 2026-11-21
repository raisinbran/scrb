### A-903 — 2026-11-20 — W10 — final-pass test did not narrow input source union

- **What failed:** The new final-pass regression accessed `source.chunks` without narrowing the `TrackInput` source union. Windows and macOS typecheck both failed with TS2339 and implicit-any errors; the native helper build/tests passed.
- **Impact:** The exact PR revision had red general CI and was not eligible for review or merge.
- **Correction / remaining risk:** Narrow to the chunk-backed source shape before mapping its chunks, then let CI run on the corrected revision. No runtime recording code is changed; low.
