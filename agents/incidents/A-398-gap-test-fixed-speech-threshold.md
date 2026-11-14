### A-398 — 2026-11-14 — Claude Code (Sonnet 5.5) / Mac desktop — Gate 8 gap-size harness picked positions with a fixed loudness threshold
- **Status / attribution:** Confirmed agent error in the harness I wrote; no application defect.
- **What failed:** The position picker required a fixed RMS above 600, so TS3003a (a quiet clip, median frame RMS about 17) never produced a valid position and the picker looped forever. I launched the owner-approved run without first running the picker on all three clips, then waited about 10 minutes before checking the log.
- **Impact:** About 10 minutes of wall time on the approved run; no whisper runs started, so no quota beyond the idle wait.
- **Correction / remaining risk:** The threshold is now relative to each clip's median level, checked on all clips before the rerun. None known.
