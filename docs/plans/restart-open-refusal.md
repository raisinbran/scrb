# Task 7: Worker-restart `open` acknowledgement says `ok: false`

**Decision and proposed patch.** Owner authorized Task 7 on 2026-10-30; patch is for Claude Code to review, test and merge, not applied to `main`.
**Base `main`:** `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a`
**File:** `packages/app-core/src/recording.ts` (no contract or Electron security changes).

## Observed failure

`RecordingSession.workerExited()` increments the retry count, launches a replacement, then calls `send(reopenCommand())` **without checking `CaptureAck.ok`**. While recording, it immediately sends `start` even after the helper has refused `open` (for example, because it cannot obtain `writer.lock` or any track). A refused restart may therefore look healthy or leave the process running without saving audio. The existing tests cover a failed **launch** but not a refused **open** acknowledgement.

## Recommended decision: fail closed, retry within the existing limit

1. A restart `open` succeeds only when the acknowledgement has `ok: true` and `gate: 'closed'`. Never send `start` following a refused or unexpectedly open acknowledgement. Kill that replacement worker before trying the next one.
2. A restart `start` succeeds only when it has `ok: true`, `gate: 'open'` and at least one `activeTrack`. Otherwise kill and retry; never report partial successful capture when no track is running.
3. **Three** replacement workers total (`MAX_WORKER_RESTARTS`), including spawns that throw, refused `open`, and refused `start`. When exhausted, call `onEnded('workerFailed')`; the Electron controller seals saved audio as recovered and shows its persistent `audioMissing` warning. Do not automatically start a new meeting or widen app-only capture to whole-computer audio.
4. A worker that died during a confirmed pause must restart with its gate **closed** and must not receive `start` until the user resumes. Stop and pause-failure retain their existing priority. Ignore exit callbacks from a replacement deliberately killed for refusing a command; a single retry loop owns the attempt count.
5. Keep the original `clockOriginNs` across successful replacements, so saved chunks continue on one timeline. No new IPC messages, statuses or contract edits.

**Limit not addressed by this slice:** A helper that stays alive but never answers `open` can still stall the restart. Introduce a separately measured startup/restart timeout if real worker evidence warrants it; do not apply the pause command's 200 ms timeout to device initialization.

## Tests and acceptance

| Failure / race | Test |
| --- | --- |
| R1: First replacement returns `open.ok:false` | No `start` on that adapter, it is killed, next replacement opens and starts. |
| R2: Every replacement refuses `open` | Exactly three attempts, exactly one `workerFailed`, no false Recording success. |
| R3: Replacement refuses `start` or has zero active tracks | Killed and retried; no `reportMissing` from a failed start ack. |
| R4: Refusal during confirmed pause | Replacement never receives `start`; stays closed or ends with `workerFailed` after exhausting attempts. |
| R5: Late exit after deliberately killing a refused worker | No parallel restarts or extra attempts; Stop can win. |
| R6: Success after one refusal | `clockOriginNs` preserved; the next worker's start runs on the original timeline. |

**Verification:** `npm run check` and `npm test` must be run by Claude Code on the complete checkout; Mac/Windows simulated worker tests and real crash tests remain with Claude Code. Only synthetic adapters/meeting IDs should be used. Source inspected; no tests or hardware runs have yet been executed for the proposal.
