# Clean Stop vs. crash after Pause — repair plan

**Status: PROPOSED. Owner approval required before implementation.** Documentation only; no Gate 3 decision.

## Overview

Fix the confirmed [PR #24 Stop-while-paused defect](https://github.com/raisinbran/scrb/pull/24#issuecomment-6565257583) without changing audio capture, chunk data or shared interfaces. A clean Stop must be eligible for the existing final transcription queue; a genuine crash must remain a crash.

## Definition of done

An explicit successful Stop produces a durable terminal `stop` record in `audio/session.log`, even when no track has an open chunk. Recovery identifies it as `ready` with `endedBy: stop`; the existing desktop flow schedules the final pass when configured. A parent-process crash, including one after Pause, must not create that record and remains `recovered` / `endedBy: crash`. Existing saved audio bytes stay unchanged.

## Current state

Base commit: `639a25e08ac602d6618204df66cff95c910120d7` (`main`; `packages/app-core/src/recovery.ts` is unchanged in PR #24).

- `recovery.ts:392-394` trusts only the last chunk close reason on each track. No new chunk is required at Stop after Pause, immediate Resume or permission loss.
- `apps/desktop/src/main/recording.ts:174-203` already starts the final pass if `sealAudio` reports `ready`; no desktop behavior change is needed.
- Both helpers also finalize audio on stdin EOF / implicit `quit`, so recording `stop` from general cleanup would incorrectly label a real app crash as clean.

## Module shape and implementation steps — after approval only

1. **Native helpers:** In `native/macos-capture/src/main.swift` and `native/windows-capture/src/Session.cpp`, append `{"event":"stop","commandId":"...","atNs":...,"seq":...}` through the existing durable `session.log` writer **after** the explicit Stop has closed/drained chunks and **before** its successful acknowledgement and lock release. Do **not** write it for EOF, implicit `quit`, helper death, failed Stop or cleanup after a parent crash. On Windows, `DoStop` is also invoked for `quit`; distinguish its command name. On macOS, EOF calls `session.stop()`; distinguish the explicit command. A missing/torn marker must never prove clean Stop.
2. **Recovery:** In `packages/app-core/src/recovery.ts`, recognize a finite, nonnegative `atNs` on the **terminal, valid** `stop` event, using session-log file order rather than `seq` across helper restarts. Use that marker to classify a newly sealed recording as clean, not a `pause` or `stop` chunk close reason. Retain a previously sealed `chunks.json` clean outcome on repeat sealing; without a marker, conservatively classify a previously unsealed older recording as recovered. Include Stop time in the session timeline so a Pause-to-Stop span is preserved, and keep a permission-closed track's trailing `audioMissing` interval visible up to Stop (excluding confirmed paused time). Do not alter any audio chunks or writer-alive safeguards.
3. **Tests:** Extend existing `packages/app-core/src/recovery.test.ts` fixtures and the existing native helper tests for explicit Stop versus EOF; verify the desktop final-pass enqueue path with its existing fake queue. Reuse helpers rather than building a new framework. Update the outdated chunk-based clean-Stop description in `docs/plans/crash-safe-chunks.md` only when implementing.

## Verification after approval

| Scenario | Required result |
| --- | --- |
| Normal Start → Stop | `ready`, `endedBy: stop`; final pass queued if configured |
| Start → Pause → Stop | `ready`; paused span ends at explicit Stop, no fabricated missing audio; final pass queued |
| Pause → Resume → immediate Stop | `ready` even when one track's last chunk is still `pause`; final pass queued |
| Permission loss → Stop | `ready`; actual trailing audio loss is still marked, saved chunks unchanged; final pass queued |
| Pause → genuine crash / stdin EOF | No `stop` marker; `recovered`, `endedBy: crash`; no false final-pass enqueue |

In all five cases, compare every pre-existing saved chunk byte-for-byte and check repeat sealing. Test a missing or truncated Stop log record as a crash, not a clean Stop. Run `npm run check` and the existing helper test suites on both operating systems; then independently verify the five flows in the real desktop application with invented/public audio. Leave Gate 3 open.

## Notes for agents

1. **User-decided:** This branch is documentation only; do not implement, merge or alter PR #24 until the owner approves this plan.
2. **Inferred from code:** The existing chunk-only inference can mistake EOF cleanup for explicit Stop. Requiring the terminal log marker for newly sealed recordings is intentionally conservative for old, unsealed recordings; their audio is retained.
3. **Outside scope:** The unrelated live-status label defect also noted on PR #24; no UI, shared-interface, transcript algorithm, importer or gate changes.
