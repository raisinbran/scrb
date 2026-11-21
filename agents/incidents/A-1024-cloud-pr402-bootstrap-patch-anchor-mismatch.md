### A-1024 — 2026-11-21 — ChatGPT cloud — stale installer bootstrap source patch anchors

- Attribution: Preventable cloud source-editor context assumption.
- What happened: Two attempted substring replacements in scripts/run-win-installer-smoke-standard-user.ps1 failed their own exact-one-anchor guard; the expected whitespace surrounding a copy operation was not present.
- Effect: Both calls rejected before GitHub update_file; no change to the original standard-user behavioral bootstrap or runner state.
- Correction: Preserved the existing guard-only bootstrap unchanged and added a separate run-win-installer-smoke-real-standard-user.ps1 with explicit producer evidence and a fresh account, avoiding invasive modification of the historical test.
- Prevention: Fetch exact source and verify anchors before editing; prefer narrow adjacent entrypoints over expanding already-verified guard-only paths.
- Remaining: Real NSIS standard-user installation is source-wired but not yet executed.
