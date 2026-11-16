### A-560 — 2026-11-15 — Codex / Mac desktop — remote head check used invalid argument and restricted network

- **Status / attribution:** Confirmed agent lookup error. No repository state changed.
- **What failed:** A GitHub commit lookup was first called with `sha` instead of the required `commit_sha`, and a fallback `git ls-remote` attempt could not resolve GitHub in the restricted command environment.
- **Impact:** One lookup attempt failed schema validation and one read-only command failed before returning data; no code, Git refs, or files were changed.
- **Correction / remaining risk:** Used the connected GitHub commit and PR fetch tools to verify pushed head `b2a13a86` and its exact-head CI run. Low.
