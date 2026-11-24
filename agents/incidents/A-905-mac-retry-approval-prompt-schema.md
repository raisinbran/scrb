### A-905 — 2026-11-20 — Codex Desktop — CI retry approval prompt used an invalid field

- **Status / attribution:** Confirmed tool-call schema error; no retry, repository or workflow action occurred.
- **What failed:** My first `request_user_input_async` call included a `question` key, but this tool accepts each question's text in `title` and has no `question` field. The call was rejected before any prompt was presented.
- **Impact:** One failed permission-request call and a brief delay. No approval was inferred and no CI retry was started.
- **Correction / remaining risk:** I resubmitted the request using the supported schema. The owner authorized one retry of the failed Windows job; it passed on the same exact PR head, and an independent formal review then passed. This record is now copied to the separate staging branch `rosmont/mac-m5-post375-accounting-20261120`; no reporting PR has been created yet. Low.
