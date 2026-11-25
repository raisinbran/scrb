### A-1173 — 2026-11-25 — Claude Code — planner brief quoted owner transcript text into a public-repo task

- **Agent:** Claude
- **Attribution:** Confirmed; the planning session's brief quoted a short owner transcript excerpt, and this session copied it into `docs/research/punctuation-diagnosis-20261125.md` despite the numbers-only scope.
- **Observed:** The excerpt was published in the PR 501 head commit of a public repository. Independent review caught it.
- **Impact:** Owner transcript text is in public Git history of the PR branch. Removing it from the new head does not remove it from earlier commits.
- **Correction:** Excerpt removed from the note, which now identifies the recording by numbers only; the excerpt is not repeated in any file, PR text or comment. History is not rewritten; the owner decides any history remediation.
- **Prevention:** Treat any owner-supplied transcript text in a brief as private; never copy it into repo files, and describe recordings by numbers.
