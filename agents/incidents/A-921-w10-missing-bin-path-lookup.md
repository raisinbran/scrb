### A-921 — 2026-11-20 — W10 — AMI preflight checked an absent checkout-local binary folder

- **Status / attribution:** Confirmed agent error; no product or source state changed.
- **What failed:** A bounded listing targeted `packages/transcription/.bin`, which did not exist in this clean worktree.
- **Impact:** That lookup did not establish whether the known AMI/model assets were available elsewhere.
- **Correction / remaining risk:** Reused task-known asset locations and verified the required fixture, model and runtime files there. No broad environment search was repeated. Low.
