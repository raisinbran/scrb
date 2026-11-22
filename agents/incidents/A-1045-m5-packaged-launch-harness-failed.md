### A-1045 — 2026-11-21 — Codex Desktop / Mac M5 — packaged smoke test failed before app launch

- **Status / attribution:** Confirmed test-execution error; application behavior and root cause unknown. No app-level result was produced.
- **What failed:** The packaged invented-transcript Copy test invoked the candidate executable through Playwright Electron launch. The harness reported `Process failed to launch!` before a window or assertion was reached. This did not exercise a normal macOS Launch Services GUI launch.
- **Impact:** One smoke attempt failed; the disposable fixture/profile were prepared, but Copy, seeking, model visibility, and normal exit remain unverified. No production app or library was touched.
- **Correction / remaining risk:** Stopped without retrying the same launch route. The next attempt should use the supported host GUI/Launch Services path with an explicit temporary user-data directory and verify the backend storage location before opening any recordings UI. The failure does not establish an application defect or confirm that the package launches normally.
