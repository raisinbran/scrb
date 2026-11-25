### A-1155 — 2026-11-25 — Codex Desktop / Mac — offline install pointed at an empty cache

- **Agent:** Codex (gpt-6.2-sol, Mac desktop)
- **Effect and evidence:** The first dependency installation exited with `ENOTCACHED`: `request to https://registry.npmjs.org/undici-types/-/undici-types-6.20.0.tgz failed: cache mode is 'only-if-cached' but no cached response is available.`
- **Attribution:** The command pointed npm at a new temporary cache before seeding it from the local cache.
- **Correction:** Copied the existing cache to the temporary directory, installed the locked dependencies offline, and provisioned the matching local test binaries.
- **Remaining risk:** None identified from the failed install. See the per-task usage row for shared allowance observations.
