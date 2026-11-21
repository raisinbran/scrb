### A-859 — 2026-11-19 — W10 — default sandbox shell did not select per-user Node 22

- **Status / attribution:** Confirmed execution-context limitation; no dependency installation occurred in the failed command.
- **What failed:** After prepending the checksum-verified Node 22 folder to PATH in a default sandbox command, `node --version` still resolved to system Node 26.13.0. The version guard stopped the command before `npm ci`.
- **Impact:** One dependency-install attempt did not start; the worktree and machine-wide Node/PATH were unchanged.
- **Correction / remaining risk:** Re-ran with the exact verified per-user `node.exe` in the approved execution context and confirmed Node 22.23.4 and npm 10.9.9. Low.
