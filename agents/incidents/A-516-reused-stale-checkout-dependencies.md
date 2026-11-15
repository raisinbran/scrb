### A-516 — 2026-11-15 — Codex / Mac desktop — temporary dependency links resolved stale workspace packages
- **Status / attribution:** Confirmed agent setup error. No tracked project files were changed by the links.
- **What failed:** Reusing `node_modules` from the older primary checkout caused Vite to miss a workspace-only plugin and made typecheck resolve stale `@scrb/*` packages, producing unrelated errors.
- **Impact:** One Vitest startup failed and the first repository typecheck was not a valid result for the fresh worktree.
- **Correction / remaining risk:** Removed the temporary links and ran `npm ci --ignore-scripts --offline` in the fresh worktree. Subsequent typecheck, lint and test results used the branch's locked workspace dependencies. Low.
