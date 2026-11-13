### A-348 — 2026-11-13 — Claude Code (Sonnet 5.5) / Mac desktop — summaries slice 1: Prettier not run on changed files before the push

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I pushed PR #185 without running Prettier on the changed files, so both CI jobs failed before tests on `mock-backend.test.ts`, `packages/summary/src/extract.ts` and `packages/summary/src/llm.ts`.
- **Impact:** CI red on the first push and one extra review round.
- **Correction / remaining risk:** Files formatted and rechecked. Low.
