### A-1212 — 2026-11-26 — Tonal mock setup and capture errors

- **Agent:** Codex (Desktop, Mac)
- **Observed effect:** Creating a linked worktree attempted a write to sandbox-protected Git metadata. The first server start attempted a loopback bind inside the sandbox and failed with EPERM. The incident draft also omitted the required agent field, which the register checker caught. The first full check also ran inside the sandbox, which blocked loopback test fixtures. Capturing immediately after a viewport change produced stale and partially painted screenshots.
- **Attribution:** The task setup assumed the worktree and loopback writes would be allowed, and visual QA captured before the browser had painted the new viewport.
- **Correction:** Created an isolated checkout in the writable temporary directory and ran the mock server with the approved loopback permission. Reran full checks with loopback permission. Recaptured after verifying the new viewport and allowing the resized page to paint.
- **Remaining risk:** The isolated checkout is temporary. The draft branch is the durable handoff if publication succeeds.
