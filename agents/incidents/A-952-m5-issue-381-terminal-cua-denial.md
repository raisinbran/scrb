### A-952 — 2026-11-20 — Codex Desktop — Computer Use denied Terminal selection

- **Status / attribution:** Confirmed tool-selection error; no UI action occurred.
- **What failed:** I requested the Terminal app through Computer Use, which the host safety policy disallows.
- **Impact:** One no-op UI selection attempt.
- **Correction / remaining risk:** Used the authorized test execution route to launch the isolated packaged app and kept real recordings out of scope. Low.

- **Incident-ID correction (2026-11-20):** Former provisional A-889 was reassigned to A-952 because open PRs #376/#377 independently reserve A-886–A-893 for different Windows events. The original evidence remains in the PR's commit history; the underlying mistake and attribution are unchanged.
