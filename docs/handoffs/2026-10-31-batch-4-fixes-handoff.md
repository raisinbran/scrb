# Batch 4 — D1–D8 QA fixes handoff

**Date:** 2026-10-31  
**Repository:** `raisinbran/scrb`  
**Working branch:** `rosmont/meeting-scribe-remaining-20261031`  
**Starting head:** `330c9bb99cc0fa33a9dd2054656f03fe3d92114d`  
**Verified final code head:** `c182963b307702159bd881cb91d76426d351838a`  
**Pull request:** [#6](https://github.com/raisinbran/scrb/pull/6) — QA only, draft; **do not merge without owner gate approval**.

## Branch prerequisite

Requested `origin/qa/chatgpt-batch-4` was **not present**: GitHub branch search returned no match, the GitHub refs API returned 404, and comparison using that ref failed with 404. The QA findings were already present in `docs/handoffs/2026-10-31-batch-4-qa.md` on the working branch. **No merge from `qa/chatgpt-batch-4` was made or claimed.** The original branch was advanced without touching `main`. Claude should resolve this missing branch only if its ancestry is materially needed.

## Defect commits and regressions

| Defect | Commit | Minimal repair and new regression coverage |
| --- | --- | --- |
| D1 | `fadb30e7` | For `snapshotVerified`, validate the snapshot's hash/SQLite contents, open live SQLite normally for crash rollback, compare preexisting rows, either retry an old-version upgrade or promote a verified target version to case C; never restore a snapshot over live. `packages/storage/test/index-db.test.ts`: real child killed before and after migration. |
| D2 | `ca0c6f3d` | Ignore and best-effort remove `index.sqlite.upgrade-state.json.tmp` at startup, and exclude it from deletion's upgrade-copy inventory. `index-db.test.ts`: interrupted temporary journal does not block upgrade; `library.test.ts`: temporary journal is not a retained meeting copy. |
| D3 | `f67af612` | Verify live database on a normal SQLite connection in `migrationVerified`, allowing hot-journal rollback; keep snapshot read-only. `index-db.test.ts`: kill a separate writer in an uncommitted transaction with retained snapshot and reopen safely. |
| D4 | `4303e909` | Add `VocabularyStore.discardMeetingHistory` covering both undo/redo states, contexts, and provenance. Call after all three `deleteMeetingRows` sites in `library.ts`. `library.test.ts`: delete term, delete meeting, then Undo or Redo cannot restore meeting-derived forms/contexts. |
| D5 | `991c9537` | Forward `CaptureAck.atNs` through `RecordingSession.onStateChanged` to controller. Use session-clock milliseconds for confirmed pause/resume, removing wall-clock-offset calculation. `apps/desktop/src/main/recording.test.ts`: exact ACK nanoseconds despite delayed UI timing. Existing app-core callback callers retain a compatible ignored third argument. |
| D6 | `ae493f41` | Clear pause spans, emitting the empty update, when controller enters idle. `apps/desktop/src/main/recording.test.ts`: stopped recording yields empty snapshot and event spans. |
| D7 | `1d2e183a` | If an older verified snapshot is retained when a newer schema upgrade becomes due, leave old index usable and preserve its journal; do not overwrite it. Clear retained state only after successful cleanup. `index-db.test.ts`: synthetic additional migration and locked snapshot. |
| D8 | `3bac9648`, `6ba48982` | Formatting-only Prettier changes to non-contract TypeScript; CI verifies changed non-contract TypeScript against Prettier. Successful final CI run includes the later D1 regression test. |

## Focused QA follow-ups (separate commits)

- `3e4c83f0`: correct mock ACK callback and TypeScript return typing in D5/D6 regression tests after first CI typecheck failures.
- `273aad2e`: add CI Prettier check for changed TypeScript.
- `83322260`: exclude `packages/contracts/**` from the formatter's write/check path, respecting the prohibition on contracts changes.
- `3dd6b3ff`: close the verified snapshot SQLite handle before Windows tries to unlink the snapshot; previous Windows CI demonstrated `EBUSY`.
- `b309aeb3`: classify mismatched preexisting rows on restart as `INDEX_RECOVERY_REQUIRED`, preserving the blocked recovery state; previous Mac/Windows CI caught incorrect `INDEX_MIGRATION`.
- `c182963b`: add a real child-process `SIGKILL` *inside* an active SQLite schema transaction, with an invented-data marker proving the child reached the statement; verify safe recovery to target version. All platform CI tests passed on this commit.

The two early injected fault tests and the later active-transaction kill test use only temporary invented SQLite data. No `packages/contracts/` file was changed: compare of original head `330c9bb` to code head `c182963b` lists **zero contract files**. No new product features, real meetings, or new IPC were introduced.

## Exact CI evidence

**[GitHub Actions CI run #41240713665](https://github.com/raisinbran/scrb/actions/runs/41240713665)** — pull-request CI on commit **`c182963b307702159bd881cb91d76426d351838a`**, **completed successfully on Windows and macOS**.

Both CI jobs successfully ran:

1. `npm ci`
2. The new changed-TypeScript Prettier verification (`npx prettier --write` plus `git diff --exit-code`), excluding unmodified owner-restricted contract files
3. `npm run typecheck`
4. `npm run lint`
5. `npm run build -w @scrb/summary`
6. `npm test`, including all new synthetic real-child-crash and deletion/pause regressions
7. `npm run check:boundaries`
8. `npm run build`
9. `npm run test:smoke`

This final green run supersedes the earlier failing intermediate runs, notably #41240379435 (recovery error code and Windows snapshot lock) and #41240551786 (formatting), both addressed in subsequent commits. A local `npm run check` run was not possible because the container could not resolve `github.com`; equivalent constituent checks ran in GitHub Actions.

## Exactly what was **not** run or verified

- **Not run locally in the ChatGPT container:** a complete Git checkout, `npm ci`, `npm run check`, local lint/Prettier/Vitest, an Electron application build or smoke test. GitHub Actions ran the listed automated commands instead.
- **Not run on the owner's physical Mac or Windows hardware:** real microphone/system-audio capture, session-log/audio timing checks, real OS microphone permissions, a real live recording, native Electron recovery-dialog interaction, or a native helper build.
- **Not run as native fault/reliability exercises:** physical power-loss tests, real antivirus/file-lock/junction/symlink/permission failures, multi-hour recording/80k-word load testing, and user-visible 200% zoom or VoiceOver/Narrator walkthroughs. The *synthetic* child kill, SQLite hot-journal rollback, and injected-lock tests **were** executed in CI; they are not proof of these native conditions.
- **Not completed or newly implemented:** Task 28 desktop export workflow, Task 32 production model downloader, Task 33 complete redistributable license notices, Task 35 native accessibility certification, or Task 20 extended hardware performance. These remain separate scope/gates.
- **Not done:** a merge from missing `qa/chatgpt-batch-4`, a merge or push to `main`, and any modification of `packages/contracts/`.

## Claude review target

Inspect the D1/D3 recovery logic and Windows cleanup, D4 history invalidation, and D5 session-clock propagation first. Confirm the final green CI run, then perform only remaining native tests required by the active gate. Keep the review minimal; do not expand to the unfinished feature work above. **Owner acceptance is still required before any merge to `main`.**
