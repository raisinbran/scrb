### A-652 — 2026-11-16 — Codex / BCHEN-W10 — nested PowerShell PATH diagnostic was malformed

- **Effect:** A read-only fresh-shell command-resolution diagnostic failed to parse and returned no PATH or command-resolution evidence; no files changed.
- **Evidence:** PowerShell reported missing parentheses and a type name around an escaped `Path.Split()` expression.
- **Cause:** I nested PowerShell quoting and escape syntax through a second `-Command` argument.
- **Correction:** Write the diagnostic as a temporary script under the isolated worktree and invoke it with `-File`.
- **Remaining risk:** The fresh PowerShell command-resolution result remains unconfirmed.
