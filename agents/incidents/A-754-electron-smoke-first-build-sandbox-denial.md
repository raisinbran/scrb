### A-754 — 2026-11-17 — Codex Desktop / BCHEN-W10 — first focused Electron smoke build was sandbox-blocked

- **What failed:** The first focused startup smoke command reached the renderer build, then esbuild was denied access to a parent directory and could not resolve the Electron entry points; Playwright did not launch.
- **Agent-controlled cause:** I started the build inside the managed sandbox instead of requesting the required elevated execution for the repository's parent traversal.
- **Impact:** One setup/build attempt failed before the test; no Electron process launched.
- **Correction / remaining risk:** Requested the permitted elevated rerun. The same focused test then passed. Low.
