### A-978 — 2026-11-20 — ChatGPT Chat — PR #350 scoped status assertion failed Prettier CI

- **Status / attribution:** Confirmed self-induced source-formatting error in the cloud correction to PR #350; not a product behavior defect.
- **What failed:** The scoped `role=status` assertion in `apps/desktop/e2e/copy-transcript.spec.ts` was written in a multiline shape that the repository Prettier formatter rewrote. The initial integrated exact-head run `44877117345` at `f3974c2655a46dc8c32f5e2c8307829703b5b41a` failed the changed-TypeScript formatting check on Windows and macOS before tests or smoke could run.
- **Impact:** One additional CI cycle and associated reviewer/runner time; exact quota cost unavailable. No installed app, recordings, contracts, backend security settings, or production library were modified.
- **Correction / remaining risk:** Apply exactly the formatter-produced three-line call shape (the locator still filters status by the intended copy-confirmation text), then require fresh exact-head CI on both platforms. This incident is separate from the pre-existing smoke failures in run `44169373776`.
