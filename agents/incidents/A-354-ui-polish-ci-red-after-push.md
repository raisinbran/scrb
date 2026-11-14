### A-354 — 2026-11-14 — Claude Code (Sonnet) — UI polish PRs pushed with CI red on both platforms

- **Status / attribution:** Agent error (PRs #215 and #216).
- **What happened:** The Settings overlay change left the macOS smoke test treating Settings as a tab, a new CSS test matched `\n` only (fails on Windows CRLF checkouts), and an export test waited 1 s for a 0.9 s mock delay (flaky on slow Windows). The e2e smoke tests were not run locally before pushing, and #216's focus test still expected the old meeting-title heading and "← Recordings" button.
- **Impact:** Independent review rejected both PRs; one extra fix round and CI reruns.
- **Correction / remaining risk:** Smoke and zoom/focus e2e now run locally and pass; the CSS test normalizes line endings; the export test uses the slow timeout. Low.
