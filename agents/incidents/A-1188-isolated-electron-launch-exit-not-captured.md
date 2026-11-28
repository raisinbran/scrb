### A-1188 — 2026-11-18 — Codex / MacBook Air M5 — direct Electron preflight did not capture child exit details
- **Agent:** Codex (Mac)

- **Status / attribution:** Confirmed agent diagnostic-wrapper error; product launch cause unknown.
- **What failed:** I directly spawned the pinned Electron executable with a fresh disposable `--user-data-dir` and captured PID 60623, but the wrapper only reported that the child had exited within 1.2 seconds. It redirected stdout/stderr and omitted the exit code/signal from its result.
- **Impact:** The process could not be tied to an active UI instance, and the reason it exited cannot be diagnosed from the retained result. No UI interaction, backend query, recording, or library read occurred.
- **Correction / remaining risk:** Stopped without another launch or process search, as required. A future supported host-context launcher should capture spawn, exit and signal events plus bounded stderr before allowing UI interaction. Current identity and storage isolation remain unverified at runtime.
