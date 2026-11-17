### A-661 — 2026-11-16 — Codex / BCHEN-W10 — Prettier expanded the plan and notices diff

- **Observed effect:** Running Prettier on the plan and third-party notice reflowed unrelated Markdown tables and spacing, making the documentation diff broader than the slice requires.
- **Evidence:** `git diff --stat` reported 94 changed plan lines and 42 changed notice lines before content review; most were table alignment and spacing.
- **Attribution:** Agent formatting choice; no technical content was lost.
- **Correction:** Restore only those two files to their starting contents and reapply the focused status/staging/Windows provenance edits without whole-file formatting.
- **Remaining risk:** Recheck the final documentation diff for scope and accuracy.
