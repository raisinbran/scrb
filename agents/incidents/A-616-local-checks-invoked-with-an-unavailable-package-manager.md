### A-616 — 2026-11-16 — Codex / Mac desktop — local checks invoked with unavailable package manager

- **Status / attribution:** Confirmed agent tool-invocation error; no source effect.
- **What failed:** `npm` was absent from this shell. I then invoked `pnpm` against an npm-managed workspace; pnpm started an install, moved seven existing development-tool packages into `node_modules/.ignored`, and failed to resolve the package registry in the network-restricted environment.
- **Agent-controlled cause:** I did not inspect the provided runtime/package-manager setup before selecting pnpm as an npm substitute.
- **Impact:** Three check commands were interrupted. I restored all seven package directories to their original `node_modules` locations and verified that the working tree contains no dependency changes. The focused Vitest test (11/11), ESLint, Prettier, and desktop TypeScript check then passed using the provided Node binary and existing local executables.
- **Evidence:** Shell outputs from this task; working-tree status and restored package paths.
- **Correction / prevention:** Use the provided Node runtime with existing repository executables; do not let pnpm perform dependency installation in this npm workspace.
