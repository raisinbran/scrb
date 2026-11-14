### A-364 — 2026-11-14 — local coding session — formatter expanded the worker-test diff

- **Status / attribution:** Confirmed session error; no application defect.
- **What failed:** I ran a formatter on the summary worker test file, which was already styled differently from the formatter defaults. It rewrote unrelated existing lines. My first attempt to restore the baseline through Git did not change the file, and a patch against that expected baseline did not apply.
- **Impact:** The working diff temporarily contained unrelated formatting churn. No unrelated changes were committed or pushed.
- **Correction / remaining risk:** Reconstructed the file from the branch base and reapplied only the build setup lines. Low.
