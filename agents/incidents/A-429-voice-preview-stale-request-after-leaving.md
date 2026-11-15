### A-429 — 2026-11-15 — Claude Code (Sonnet 5.5) / Mac desktop — profile preview request not cancelled when the screen was left
- **Status / attribution:** Confirmed agent error. Caught by independent review of PR #303 before merge and fixed in the same PR. No product defect shipped.
- **What failed:** A slow `getProfileClips` request was only guarded against a newer press, not against a stop or leaving the Speakers screen. After the screen closed, the finished request could still pause the app's other playback and run its playback steps.
- **Impact:** Review rejected the PR a second time; one extra fix commit and CI cycle.
- **Source evidence:** Review of #303 at 5d6895e3; regression test fails without the cancel check.
- **Correction / remaining risk:** Requests are now cancelled by stop and by unmount and checked after every await. Low risk. Treat unmount as a cancel for every async step, not only a newer request.
