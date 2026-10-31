# Meeting Scribe — Batch 4 handoff

**Date:** 2026-10-31  
**Repository:** `raisinbran/scrb`  
**Branch:** `rosmont/meeting-scribe-remaining-20261031` (all commits pushed; **never to main**)  
**Baseline:** `444e1cebe7981afded2598c43818f2e037cff504` (Claude QA approval already an ancestor of the working branch). The separate `qa/chatgpt-batch-3` remote branch was not available; there was no separate merge commit because the approval and QA changes were already on this branch.  
**Review gate:** Claude Code QA and owner gate approval still required before any main merge.

## Commit ledger, ordered

| Task/slice | Commit(s) | Changes |
| --- | --- | --- |
| Owner approvals | `6858fe1c` | Recorded exact Batch 4 approvals and boundaries in `2026-10-30-owner-decisions.md` |
| 1. `listImports` | `20b28cf0` | Contract, no-argument request check, mock active-import listing/test, real empty listing (real import runner not yet wired) |
| 2. Pause spans | `a5633dd6` | `ConfirmedPauseSpan`, complete `pauseSpansChanged` event without revision, `RecordingSnapshot.pauseSpans`, confirmed real/mocked state transitions, test |
| 3. Profile undo | `f6e4f45f`, `b8a5bd3e`, `3591b282`, `80c34c8a`, `f0989968`, `d155485c` | Contract/checks, transactional SQLite profile rename/merge rollback, bounded in-memory undo/redo (30), main and mock handlers, tests and fake-clock correction. Profile delete clears history; no delete Undo |
| 4. Vocabulary provenance | `d0eb831d`, `1a960c91`, `093902e2` | Append-only schema migration 5→6 with per-form correction source table and preserved-origin field, update/forget rules and synthetic multiple-source/manual/legacy tests |
| 5. Local day filtering | `13396d01`, `57a6b6b3`, `04e01e33` | Single `matchesMeetingFilter` helper used by list/search/main/mock/UI, date policy documented on `MeetingFilter`, UTC-midnight/US-Pacific/NZ timezone tests |
| 6. `meetingChanged` | `4690099a`, `7edb00a3` | Emits persisted meeting creation/metadata transitions (including final-pass success/failure and recording completion); real main bridge, mock, screens subscribe and stop status polling |
| 7. Index recovery | `db830b91`, `de845cb4`, `51267b90`, `b5c12c44`, `63c7ea91`, `ad69cf34`, `50d57e80`, `bce6bc81` | Plan trimmed to native startup cases A/B/C/E; durable snapshot provenance record, read-only validation, stopped unknown/failed upgrades, verified-upgrade lock warnings and bounded cleanup, Electron-native Retry/Open Folder/Keep Close dialog; synthetic injected-lock tests. **No case D restore.** |
| 8. Tasks 23/26/27 audit | `df81dcf6` | Exact source-based gap review and proposed unapproved revision field in `2026-10-31-tasks-23-26-27-gap-review.md`; no scope creep |
| 9a. Task 20 | `ae866c13` | Synthetic 8-hour virtual transcript DOM/initial rendering time regression bound; existing virtualization reused |
| 9b. Task 28 | `4b9c8669`, `f7a406da` | Shared transcript/summary export input adapter + test; corrected words, original text, pause gaps, recovered marker. PDF renderer and document package reused; **not full real export handler** |
| 9c. Task 32 | `90660c57`, `4322e571` | Mock update/revert concurrency guards and Revert regression test. **Not a production downloader**, no model trial/profile rebuild |
| 9d. Task 33 | `707a88ef`, `24bd2ff9`, `01965933`, `b8d07a25`, `7cfbc3fe` | Lockfile dependency/version inventory script, honest real About info, visible missing-license warning (instead of fake notices), stable notices loader, lint cleanup. **Complete redistributable notice texts not yet verified** |
| 9e. Task 35 | `d5590c38`, `28c2e171`, `b29ca1c9`, `b6c3ef5a` | Modal focus-trap fix, keyboard regression test correction, scoped source accessibility report |
| Late provenance QA | `86c887ca`, `daa08857` | Preserve correction provenance across vocabulary edit/delete Undo/Redo; cross-correction regression test |

Each row names **every Batch 4 commit**. All changes are separate from `main`. The one native Electron UI change `ad69cf34` is its own commit; no C++ helper was changed. The index recoverability and audio/privacy-sensitive work remains subject to Claude QA.

## Implementation notes / unresolved decisions

1. **Real imports**: `listImports` returns [] on main because there is no live import registry in the real backend. The mock is process-local, bounded by active jobs and does not expose file tokens.
2. **Confirmed pauses**: events send full spans after acknowledged state changes and snapshot restores them without revision. Current timings are derived from the controller's wall-clock offset, not native gate event timestamps; validate alignment against sealed audio and hardware pause ACKs before calling timing verified.
3. **Profiles**: Undo is **in-memory** (not durable across app restart) and only for rename and merge. Permanent delete zeroes database voice data and clears history. Verify no stale history can revive an embedding after external changes; confirm UI irreversible deletion message. No profile rebuild/trial.
4. **Vocabulary migration**: v6 marks pre-existing/unknown misheard forms preserved, tracks correction-linked source rows, and retains manual forms. Later QA patches preserve these through term Undo. Schema upgrade, WAL/AV locks, crash consistency and migrated legacy DBs require actual tests.
5. **Local dates**: one shared local-calendar rule uses the machine's `Date` timezone. ISO date-only bounds remain dates, not UTC midnight. Date-filtered search performs final in-memory filtering of the retrieved matches to avoid dropping adjacent UTC dates; verify search performance on large libraries.
6. **Status updates**: persisted `Library.createMeeting` / `writeMeta` are the single publish points, capturing final pass success/failure. UI dropped status polling. A caller that does not persist a status cannot generate an event; verify transcript and summary events still refresh views when required.
7. **Index recovery**: startup cases A/B/C/E only. Case B preserves and blocks writes until an owner-directed decision; **case D restore remains prohibited**. A verified newer live index remains usable if its old snapshot is AV-locked, with retention warning. No new IPC. Native dialog controls need installed Electron tests; `migrationVerified` identity and schema safety need careful external QA before acceptance. Unowned copies are never removed.
8. **23/26/27**: refer to `2026-10-31-tasks-23-26-27-gap-review.md`. Unapproved `WordRange.expectedRevision` and speaker-history rebasing remain deferred. No silent index rollback; no guaranteed physical deletion of user backups. Export-writer busy-state guard awaits an actual export job registry.
9. **Task 20**: virtual scrolling already existed; only a synthetic performance assertion was added. A >4-hour hardware and actual 80k-word timing/memory run still needed.
10. **Task 28**: the shared adapter is ready, but the actual desktop `exportMeeting` handler, disk job lifecycle, conflict locks, native PDF printing and export files are **not** implemented. The adapter alone is not evidence of working exports.
11. **Task 32**: real `checkModelUpdates`, `installModelUpdate`, `revertModel` need trusted manifests, verified downloads, atomically switched versions, error handling and a security-approved plan if a new network/privileged behavior is introduced. Current slice proves mock-state semantics only.
12. **Task 33**: lockfile audit is **inventory, not license certification**; root lockfile has 341 package entries, export 97, summary 106, transcription 126 (overlap exists). Files under `phase0/` and transcription mention some native components, but a complete bundle-dependent `THIRD_PARTY_NOTICES.md`, source-offer/license texts and CI completeness check are not ready. The real getLicenses returns [] and the UI discloses that. Do not ship with this as completed legal notices. No invented license text.
13. **Task 35**: source code shows a reverse-Tab dialog defect (fixed) and unstable notices loader (fixed). Real Windows Narrator/macOS VoiceOver, zoom and contrast testing not done.

## Exact checks NOT RUN for Batch 4

- No `npm install` or `npm ci`, `npm run check`, `npm run test:smoke`, `npx prettier --check`, `npx prettier --write`, TypeScript `tsc` on the repo, ESLint, Vitest, Playwright, Electron build or smoke tests were run.
- No native Windows or macOS helper build, installed Electron UI, real microphone/system audio capture, permission tests, T21 300-s replay, long-run tests, real model download/transcription, AMI evaluation, OS/timezone hardware test, actual docx/pdf export, file-lock / AV simulation on a real Windows host, native dialog keyboard interaction, or screen-reader/contrast test was run.
- **The newly authored tests are not passed/failed; they are unexecuted.** A prior Claude QA batch did run tests on older code and is not proof for these commits.
- Direct checkout was attempted with `git ls-remote https://github.com/raisinbran/scrb.git HEAD` and failed: `Could not resolve host: github.com`. The container has Node/tsc but **not the complete GitHub repo or its npm dependency tree**. GitHub connector reads/commits and exact branch ancestry checks succeeded, but cannot substitute for local compiler/Prettier/Vitest results.
- Source-level anchors were checked for uniqueness before edits; that is not executable proof. **Review all changed TypeScript, including tests and formatting, before merging.**

## Review order for Claude Code

1. Run `npm ci` as appropriate, `npm run check`, Prettier check on changed source files, then `npm run test:smoke`. Fix compile/test/format issues with short commits on this branch, not main.
2. Prioritize **SQLite migration/provenance and undo**, recovery journal C/locked snapshot, and recording pause timing. Run index-db tests on real files, Windows/macOS lock tests and restart behavior.
3. Validate `meetingChanged` event timing and UI subscriptions, profile delete irrevocability, date bounds, and 8-hour transcript render performance.
4. Review remaining contract-free tasks and outstanding type decisions, approving only discrete slices. Full exports, model installation, license notices and native accessibility remain incomplete.
5. Do **not merge main** until QA and the owner gate approval.

**Scope discipline:** No additional unapproved `packages/contracts/` shapes. No restore case D, no model trial/profile rebuild, no real data, and no fabricated test results.
