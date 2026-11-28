### A-1184 — 2026-11-17 — Codex / MacBook Air M5 — invented-data Electron smoke could not launch inside shell sandbox
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed execution-boundary failure; no application defect.
- **What failed:** The requested `copies an invented saved transcript through the Electron clipboard` Playwright test built successfully but Electron returned `Process failed to launch!` in the default shell sandbox, before UI assertions ran.
- **Impact:** One initial test attempt failed before exercising the application. It did not touch `/Applications/Scribe.app`, real recordings, TCC settings, or prior uncommitted files.
- **Correction / remaining risk:** Retried the exact test once outside the shell sandbox with the test's generated temporary user-data/library profile. It passed in 2.5 seconds and confirmed the exact invented clipboard text. Low.
