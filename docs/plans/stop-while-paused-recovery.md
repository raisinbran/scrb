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

1. **Native helpers:** In `native/macos-capture/src/main.swift` and `native/windows-capture/src/Session.cpp`, write `{"event":"stop","commandId":"...","atNs":...,"seq":...}` **only for an explicit Stop command**. First finish and check all track drains and known chunk-write results (including Windows `PostAndWait` return values). Then wait for a checked write, flush and disk sync of the terminal line on the existing session-log queue before a successful Stop acknowledgement and writer-lock release. Windows `SessionLog::Record` currently returns no write result; macOS `record` does not check its I/O results, so the Stop path needs a minimal completion result. On failure, report Stop unsuccessful and retain all audio. Do not emit this marker for stdin EOF, implicit `quit`, helper death or parent-crash cleanup; both helpers currently run ordinary Stop cleanup on EOF.
2. **Recovery:** In `packages/app-core/src/recovery.ts`, inspect the **raw end** of `audio/session.log` rather than trusting `readLogLines()`, which skips malformed lines. Accept Stop only when the file ends with one complete, newline-terminated JSON `stop` record, with no later bytes or records, a nonempty string `commandId`, a safe nonnegative integer `atNs`, and a valid positive `seq`. File order determines the last event; `seq` can restart at 1 after a helper restart. Use this marker, never a `pause` or chunk close reason alone, to classify newly sealed audio as `ready`. Keep previously sealed `chunks.json` outcomes stable on repeat sealing; old unsealed recordings without a marker remain `recovered`. Include Stop time in the session timeline and preserve the writer-alive check and every saved chunk.
3. **Trailing gaps:** A confirmed Pause through Stop is `paused`, not missing audio. If the last chunk closed for known permission loss, preserve the genuine trailing `audioMissing` span up to Stop, excluding paused time. Do not infer definite audio loss merely because a quiet track has no late chunk; keep existing whole-computer silence / `possiblyMissing` behavior.
4. **Tests:** Extend `packages/app-core/src/recovery.test.ts` and existing helper tests with the five scenarios below, a complete-but-not-terminal or malformed Stop tail, a failed log sync and a failed Windows track drain. Verify final-pass enqueue with the existing desktop fake queue, and compare saved chunk bytes before and after recovery. No new testing framework. Update the outdated chunk-based Stop description in `docs/plans/crash-safe-chunks.md` only during approved implementation.

## Verification after approval

| Scenario | Required result |
| --- | --- |
| Normal Start → Stop | `ready`, `endedBy: stop`; final pass queued if configured |
| Start → Pause → Stop | `ready`; paused span ends at explicit Stop, no fabricated missing audio; final pass queued |
| Pause → Resume → immediate Stop | `ready` even when one track's last chunk is still `pause`; final pass queued |
| Permission loss → Stop | `ready`; actual trailing audio loss is still marked, saved chunks unchanged; final pass queued |
| Pause → genuine crash / stdin EOF | No `stop` marker; `recovered`, `endedBy: crash`; no false final-pass enqueue |

In all five cases, compare every pre-existing saved chunk byte-for-byte and check repeat sealing. An absent, torn, unterminated or followed-by-data Stop record must not make a newly sealed recording clean. Test a log-write or sync failure and a Windows drain timeout without a successful Stop acknowledgement; no sound may be discarded. Run `npm run check` and existing helper tests on both operating systems; independently verify the five desktop flows with invented/public audio. Leave Gate 3 open.

## Notes for agents

1. **User-decided:** This branch is documentation only; do not implement, merge or alter PR #24 until the owner approves this plan.
2. **Inferred from code:** The existing chunk-only inference can mistake EOF cleanup for explicit Stop. Requiring the terminal log marker for newly sealed recordings is intentionally conservative for old, unsealed recordings; their audio is retained.
3. **Inferred from code:** Even if a sync operation reports failure, a complete marker may remain readable on disk. Recovery cannot reconstruct that unrecorded I/O error: reject the successful acknowledgement, and classify the **surviving bytes** conservatively without adding a second transaction format.
4. **Outside scope:** Recordings already mislabeled `recovered` do not get automatic retroactive final passes. The unrelated PR #24 live-status label defect is also excluded; no UI, shared-interface, transcript algorithm, importer or Gate 3 changes.
