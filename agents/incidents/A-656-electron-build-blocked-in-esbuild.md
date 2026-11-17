### A-656 — 2026-11-16 — Codex / BCHEN-W10 — Packaged build blocked while esbuild resolves Electron entrypoints

- **Observed effect:** `scripts/package-win.cmd` reached `npm run build`; Vite completed, but `scripts/build-electron.mjs` failed to resolve the existing main and preload entrypoints. esbuild reported `Cannot read directory "../../../../../../../..": Access is denied`.
- **Evidence:** `apps/desktop/build/package-win-slice2.log`; the `esbuild.exe` platform binary exists and reports version 0.28.2, and PowerShell confirms both source entry files exist. A focused one-entry diagnostic with an absolute path produced the same access-denied error.
- **Attribution:** Environment/access failure during the agent-run packaging attempt; exact boundary still under investigation. The initial hypothesis that the esbuild executable was missing was incorrect.
- **Correction:** Preserve the failed log and diagnose the process filesystem boundary before retrying the package build.
- **Remaining risk:** Packaged Electron output is not yet built; no application source change is justified by this error.
