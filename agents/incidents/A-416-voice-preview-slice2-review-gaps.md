### A-416 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — profile preview chooser, request order and mock did not match their own rules
- **Status / attribution:** Confirmed agent error. Caught by independent review of PR #303 before merge and fixed in the same PR. No product defect shipped.
- **What failed:** (1) The chooser checked for other speakers only inside the passage, but playback started 0.5 s earlier, so the lead-in could contain another voice. (2) A slow `getProfileClips` for one profile could finish after a later press on another profile and replace its playback. (3) The mock ignored the real chooser's eligibility (saved audio, length, start, overlap, gaps).
- **Impact:** Review rejected the PR once; one extra fix commit and CI cycle.
- **Source evidence:** Review of #303 at 39e1d35a; fix commit on the same branch with tests that fail without the fix (stale request) and for missing audio.
- **Correction / remaining risk:** Voice previews start exactly at the passage, the newest request wins, and the mock follows the real eligibility rules. Low risk. Validate the whole played interval, not the clip alone, and test late async results.
