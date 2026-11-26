### A-1180 — 2026-11-25 — Claude Code (Sonnet 5.5) / Mac desktop — boundary diagnosis: harness error and missing usage start reading
- **Agent:** Claude (Sonnet 5.5, Mac desktop worktree session)
- **Status / attribution:** Confirmed agent errors; no application defect.
- **What failed:** My decode script used top-level await in a `.ts` file outside any package, so all three launches failed instantly and I had to rename it and relaunch; I also passed meeting names as one quoted argument once. I did not read `get_usage` at task start, so start percentages are unavailable.
- **Impact:** One wasted launch round (seconds of CPU) and a usage row without start readings. The Mac was also heating while the decodes ran; I reniced them after the coordinator asked.
- **Correction / remaining risk:** Fixed the script; start readings recorded as unavailable. No remaining risk.
