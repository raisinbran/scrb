# New incidents

One file per incident, named `A-<number>-<slug>.md`, holding one `### A-<number> — date — agent — title` entry in the format of the legacy [register](../agent_self_induced_failures.md) (read its last lines only). Never append to the legacy file.

**Numbering:** take the next number above the highest in the legacy register and this folder. Two parallel PRs may pick the same number; `npm run check` then fails on the repeat, and the PR that merges later renames its own file and heading to the next free number. No other file changes, so this never conflicts in git.
