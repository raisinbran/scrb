### A-591 — Electron acceptance launch blocked by macOS LaunchServices

- **Status / attribution:** Confirmed environment/tooling failure; no application defect or agent-controlled root cause established.
- **What failed:** One Playwright acceptance attempt could not open an Electron window. macOS crash diagnostics report SIGABRT in LaunchServices application registration (`___RegisterApplication_block_invoke` / `GetCurrentProcess`).
- **Agent-controlled cause:** Unknown; no cause is inferred from the crash stack.
- **Impact:** No jump timing was collected. The test did not reach the UI and was not retried.
- **Evidence:** Sanitized local record at `/private/tmp/scrb-transcript-jump-evidence-20261116.md`; raw reports remain local due to machine/process metadata.
- **Correction / prevention:** Preserve the bounded timing probe for CI and report Electron measurements as unverified unless it runs successfully.
