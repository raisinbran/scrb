# Task 36 — security and privacy code review

**Reviewed:** `apps/desktop/src/main/{main,security,ipc,dispatch,backend,meetings}.ts`, `src/preload/preload.ts`, `packages/contracts/src/validate.ts`, `packages/storage/src/{logs,layout,library}.ts`, transcription worker and the additions staged on this branch. **Base main:** 7790843. Findings are hypotheses from source inspection; exploitability was not dynamically tested.

## Ranked findings

| Priority | Evidence and risk | Recommendation / proof |
|---|---|---|
| **High** | `serveRenderer` in `security.ts` enforces lexical `path.resolve` containment, then `net.fetch(file://...)`; it does not reject symlinks within the asset root. A link in the served directory could resolve outside the allowed asset tree. | Before any security-sensitive code changes, write/approve a small plan: canonicalize root and target, refuse symlinks/junction escapes, catch malformed percent encoding, test direct, encoded traversal and symlink requests with synthetic files; preserve one app scheme and CSP. |
| **High** | `isTrustedSender` in `main.ts` trusts a frame by origin only and calls `new URL(url)` without catching malformed values; it does not explicitly restrict to the owned window's main frame. | Check `event.sender === ownedWindow.webContents`, `senderFrame === mainFrame` and canonical origin; test malicious subframes, navigation and destroyed windows, never weaken sandbox. |
| **High** | `denyAllPermissions` prevents renderer OS permissions; it does **not** block renderer-origin `fetch` or network requests. There is no demonstrated post-setup egress-blocking policy. | After Task 31, default-deny outgoing renderer web requests except app-owned static resources. Native model downloads should use narrow, pinned, main-owned endpoints only during explicit setup. Test off-network operation and zero network traffic during recording/transcription/summary. |
| **High** | Task 29 opens user-library paths via `realpath`, but path validation is check-then-use: a path may change between verification and the OS shell opening it. | Add symlink race/junction replacement test on both OSes, and make the owned path checks robust against concurrent mutation; never allow arbitrary renderer paths. |
| **Medium** | `Logger` filters risky keys (`text|transcript|word|title|name|term|...`) and only accepts short safe scalar fields, which is a useful baseline. Coverage is not proven for nested or foreign worker stdout/error handlers. | Add a fake-worker test deliberately emitting transcript-like text in stderr, errors and unknown field names; assert it never appears in app logs or exported crash reports. Keep tests synthetic. |
| **Medium** | Current planned model download, media playback and export bridges have not all been implemented/tested. They introduce external URLs/filesystem access and background worker paths. | Freeze explicit threat models and keep renderer bridged via allowlisted `Backend`; reject path/URL parameters not in the contract. Review Task 18/19/28/31 before enabling them. |

## Positive source checks

- BrowserWindow uses `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, `webviewTag:false`.
- Preload exposes a limited `ScribeBridge`, filtering `CALL_NAMES`/`EVENT_NAMES` rather than exposing `ipcRenderer`.
- Main dispatch validates request bodies by exact runtime shape and returns safe `ContractError` envelopes.
- WorkerProcess keeps stderr in memory rather than knowingly logging transcripts; logger filters common sensitive key names.
- Storage paths reject ordinary traversal segments. Deletion is restricted to app-managed library paths in intended flow.

## Security change plan required before fixes

Per `CLAUDE.md`, security/IPC changes are risky. Primary agent should approve a concise plan for: (1) canonical asset routing and malformed URL handling; (2) exact sender-main-frame validation; (3) post-setup egress policy; (4) failure-injection tests demonstrating no local transcript/audio/file disclosure. Then implement one isolated patch with unit and Electron security smoke tests.

**Not run:** static security scanners, `npm run check`, Electron sandbox escape tests, CSP checks, egress instrumentation, Windows/macOS path-junction tests, privacy data audits, dependency vulnerability scans. No private recordings or credentials inspected. **Task 36 is a report, not a completed security gate.**