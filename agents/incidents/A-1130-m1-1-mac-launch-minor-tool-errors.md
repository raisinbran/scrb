### A-1130 — 2026-11-23 — Claude — Minor tool and setup errors during M1.1 Mac launch

- **Agent:** Claude
- **Attribution:** Confirmed self-induced, low-impact errors in one task.
- **Evidence:** (1) Checkout of origin/main aborted because four untracked local files collided with tracked files; moved them to scratchpad and retried. (2) `timeout` is not on macOS; the first package command failed instantly. (3) First `library-location.json` used key `path`; the app requires `root` (read from `isolated-test-profile.ts` before launch, so no launch was wasted). (4) A Monitor call was made without loading its schema, and a chained `sleep` was blocked.
- **Impact:** Four or five cheap retries; no launch attempt, test, or private data affected.
- **Correction:** Fixed each immediately. Note: three of the displaced local untracked files differ from main's versions and were kept in scratchpad `displaced/`.
- **Remaining risk:** Low.
