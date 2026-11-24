### A-741 — 2026-11-17 — Codex / BCHEN-W10 — Electron bundle build first ran inside the restricted sandbox

- **What failed:** The first direct `build-electron.mjs` attempt could not read a parent directory under the managed sandbox and esbuild failed to resolve the two main/preload entries.
- **Impact:** The first source-build attempt failed before producing current main/preload bundles.
- **Agent-controlled cause:** I did not use the reviewed build context required for the local compiler's repository traversal.
- **Correction / remaining risk:** I reran the same Node 22 build with reviewed access; it completed successfully. No source or dependency changes were made by the failed build. Low.
