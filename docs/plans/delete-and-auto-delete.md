# Task 4: Delete and auto-delete, including recorded meetings and cache

**Status:** Approved by owner on 2026-10-31, with recommendations A and B. Implementation requires review through the phase gate.
**Base `main`:** `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a`
**Scope:** `packages/storage/`, `apps/desktop/src/main/meetings.ts`, app startup/shutdown. Do **not** change `packages/contracts/` (the approved `deleteMeeting` call and `DeleteResult` already exist).

## Existing work to keep

`Library.deleteMeeting` renames a folder to `.deleting-<id>`, removes its index links and `cache/<id>`, checks for remnants, and resumes interrupted deletion on library open. `deleteAudio` implements audio-only retention; `previewAutoDelete` uses library-entry time rather than an imported file's recording date. Storage tests already cover ordinary deletion, failed permissions, restarts, auto-delete boundaries, and cache remnants. Do not rewrite these components wholesale.

**Current gaps verified in code:** The real `createMeetingHandlers.deleteMeeting` always returns `notImplemented`. `deleteAudio` removes the microphone/meeting directories but can leave session-level audio metadata/logs in `audio/`. Cleanup failures can leave a renamed `.deleting-` folder while the index still advertises the original name. `startAutoDeleteSchedule` exists, but startup integration needs verification. Deletion must also account for index-upgrade backups proposed in Task 3.

## Rules and implementation slices

1. **Protect active data.** A manual deletion must refuse `recording`, `importing`, or `finalPassRunning`, or any meeting whose worker still holds `audio/writer.lock`; refuse while final-pass/import or export jobs can still write into that folder. Auto-delete already defers for active recording, but extend this check to every relevant writer, including interrupted recovery. Do not delete external imported source files or any other meeting's data.
2. **Whole-meeting deletion.** Keep the atomic rename/tombstone and per-meeting lock; make retries and startup reconciliation idempotent. If rename succeeds but later steps fail, retain a recognizable pending-delete state, *never* offer a broken meeting as usable, and report remaining paths. Remove the owned meeting folder, exports, caches, relevant index row, vocabulary-context links, and voice-profile **meeting links**, without deleting a shared vocabulary term or a profile used by other meetings. Only report `verified: true` when all owned traces are gone. Do not follow symlinks/junctions outside the library; preserve unexpected user-made copies and report them instead of deleting them silently.
3. **Audio-only deletion.** Remove **all** audio owned by the meeting: both tracks, chunk manifests, session metadata/logs, partial chunks, and relevant caches. Keep `meeting.json`, `transcript.json`, `summary.json`, exports, and their references. Mark `audioDeletedAt` only after verification. Playback and any final-pass retry must fail clearly rather than reconstructing deleted audio; make repeated audio-only deletion safe.
4. **Expose the approved API.** Replace the `notImplemented` handler in `apps/desktop/src/main/meetings.ts` with `Library.deleteMeeting`; map `ok/remaining` into `DeleteResult.verified/remaining`. Return `notFound` for nonexistent meetings and a clear `conflict` for active ones. Keep deletion paths out of logs and renderer error messages except where a returned `remaining` path is necessary for verification. UI must confirm irreversible manual deletion, handle partial failure visibly, and refresh its list.
5. **Schedule and recovery.** Wire the existing auto-delete scheduler at library startup and stop it on shutdown; keep the default `Never`. Prevent overlapping sweeps and avoid deletion during recording or jobs. If the app is offline at a deadline, process eligibility on next startup. Audit Task 3's migration backups and retained corrupt-index copies: never restore a deleted meeting's index links from an older backup, and never silently delete a forensic backup containing unrelated data. Record backup retention separately from the deletion guarantee.

## Failure cases / required tests

| Case | Expected result and test |
| --- | --- |
| D1. Delete a ready **recorded** meeting with both tracks, summaries, exports and cache | All owned artifacts and index references disappear; `verified: true`. Test real handler, not only `Library`. |
| D2. Delete an imported meeting | Only library copy removed; original import unchanged. |
| D3. Attempt delete while recording, worker lock held, final pass/import/export active | Refused with `conflict`; no file changes. Inject each busy state. |
| D4. Crash after folder rename, after folder removal, and before index cleanup | Reopen finishes exactly once; no meeting resurrected or dropped unintentionally. |
| D5. Permission denied, busy file or index transaction failure | Report partial failure; retry finishes; unrelated meeting remains readable. |
| D6. Cache/scratch/export leftovers or a user-made duplicate | Report remaining artifacts; clean only owned paths; never claim verified while a copy exists. |
| D7. Audio-only retention with `session.json`, `session.log`, `writer.lock`, `.part`, chunks and cache | Audio is wholly absent, text and exports remain; a second run does nothing; UI knows playback is unavailable (contract `hasAudio` gap in Task 5). |
| D8. Retention period boundary, `Never`, imported original date, app restart, recording overlapping sweep | Delete only eligible meetings, once; never use recording date for import retention. |
| D9. Symlink/junction, path traversal and another meeting's matching filename | Never remove an external path or another meeting; invalid paths fail safely. Test on each supported OS. |
| D10. An old SQLite migration backup exists after deletion | Neither startup rebuild nor backup restore makes the deleted meeting reappear; forensic copies are called out separately. |

## Decisions / acceptance

**Recommendation A:** Treat deletion as *verified removal from app-managed active data*, **not** guaranteed physical erasure of copies, cloud snapshots, filesystem history, or retained recovery backups. Tell the user when backups may still hold data. **Recommendation B:** Do not silently delete user-created duplicate folders; report them.

**Gate:** All D1-D10 automated/fault-injection tests pass; `npm run check` and UI smoke tests pass; manual Windows/macOS tests cover locked files, startup recovery and symlink/junction boundaries. Record precisely which were not run. No real meeting recordings or transcripts in fixtures, logs or commits.

**Not run for this planning task:** No commands, build, tests, OS-level verification, or GitHub writes. Source inspection only.
