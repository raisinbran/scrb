### A-421 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — scripted edit duplicated code and broke the file
- **Status / attribution:** Confirmed agent error. Caught by the type check before any commit. No product defect.
- **What failed:** A Python edit looked up the end of a block from the start of the file, found an earlier match, and spliced a duplicate of the file's middle, leaving a syntax error.
- **Impact:** One wasted edit and rerun. Nothing was committed or pushed.
- **Source evidence:** `tsc` error TS1128 at the end of `MiniRecording.tsx`.
- **Correction / remaining risk:** File restored from git and the edit redone with the end search starting after the start. Low.
