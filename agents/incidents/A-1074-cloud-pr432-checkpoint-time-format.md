### A-1074 — 2026-11-22 — Cloud PR #432 source preparation — malformed draft checkpoint timestamp

- **Observed failure:** The first uncommitted blob for this task's usage row contained a malformed PT checkpoint reading "11/22/2026, 56 PT" (seconds without hour or minute). This blob was never referenced by a commit or published as a repository file.
- **Cause:** The authored date formatter requested seconds but omitted hour and minute, producing an incomplete time string.
- **Effect:** One incorrect draft accounting candidate; no published usage statement, Windows GUI call, test run, owner document access, or product operation was affected.
- **Correction:** Queried the clock using explicitly selected Pacific hour, minute and second fields, validated the twelve-column row, and substituted the complete time before assembling the final Git tree.
- **Remaining risk:** No comparable ChatGPT quota readings are exposed in this client; the row states that limitation and labels its end time a source-publication checkpoint rather than asserting a final review-time observation.
