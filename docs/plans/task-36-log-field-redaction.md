# Task 36 — narrow diagnostic-field privacy fix (preliminary)

**Problem:** `packages/storage/src/logs.ts` currently accepts **any** short, path-free string as a log field value if the field key is not banned. A caller putting an invented transcript word under a generic key such as `state` could therefore persist that private string. Existing stderr/prompt-key filtering does not cover this case.

**Approved cloud scope to prepare for Claude QA:** retain numeric/boolean fields; allow only known diagnostic values for error class, error code and audio track, plus a UUID under `meetingId`; redact other strings. Preserve current 14-day retention and logging failure isolation. Add an invented-word regression test asserting that generic string fields cannot persist transcript-like text. Do not touch Electron IPC, external networking, contracts, production recordings or OS settings.

**Acceptance:** the existing `errorFields` tests still pass, intended known codes stay readable, invented freeform status/state strings are redacted, `npm run check` and macOS/Windows CI pass. This is preliminary and requires Claude Code/owner QA before merge. No claim that every possible process-wide leak is eliminated.
