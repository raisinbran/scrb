### A-948 — 2026-11-20 — W10 — Test source blob differed from the local file bytes

- **Status / attribution:** Confirmed agent publication error; the worktree test file remained intact.
- **What failed:** CI's Prettier step rewrote only final-pass-speakers.test.ts on both platforms. The committed Git blob SHA did not match the local Git object SHA, showing that text serialization changed its bytes during publication.
- **Impact:** CI stopped before typecheck or tests on head ae6ec933. No application behavior was evaluated on that head.
- **Correction / remaining risk:** Publish this test file from its exact local bytes via base64, verify the Git blob SHA against git hash-object, and use a new exact-head CI run. Low.

