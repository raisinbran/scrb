### A-644 — 2026-11-16 — Codex / BCHEN-W10 — dependency install bypassed the Node 22 gate

- **Effect:** `npm ci` did not complete; the focused tests and package build have not run.
- **Evidence:** The command printed `node -v` as `v26.13.0` from `C:\Program Files\nodejs\node.exe`, then npm reported `EPERM` opening the shared `%LOCALAPPDATA%\npm-cache` content file. npm also warned that cleanup of the partially created `node_modules` tree was denied.
- **Cause:** I launched `npm ci` after only checking `node -v`, without first confirming `Get-Command node -All` or invoking npm through the explicit Node 22 executable. The shared cache was also outside the writable worktree.
- **Correction:** Confirm command resolution, invoke the npm CLI using the verified Node 22 executable, and direct npm's cache into the isolated worktree.
- **Remaining risk:** `node_modules` may be incomplete; inspect it before the corrected install and preserve any existing cache/evidence.
