# Slice 2b integration verification (plan section 9 step 5)

Date: 2026-11-12. Base: `origin/main` d518fd9. Branch `cuc/slice2b-verify-20261112`. No product code changed. No audio played; no private recordings used.

## Commands and results

Node from `~/.local/share/scrb-node/current/bin`.

1. `npm run check` (fresh worktree, `npm install` first): typecheck and lint passed. `npm test`: 74 files passed, 1 failed, 2 skipped; 1183 tests passed, 1 failed, 25 skipped. The failure is `packages/summary/test/worker.test.ts:63` (`ERR_MODULE_NOT_FOUND` for `packages/summary/dist/src/worker.js`). Cause: `packages/summary` was not built in the fresh worktree, so it is a setup issue unrelated to slice 2b. Not rerun, per the no-rerun rule; CI on both platforms is the check for it. Because `npm test` failed, `check:boundaries` did not run inside `check`; run alone it printed "skipped: not a ui/ or backend/ branch".
2. `npx vitest run packages/storage/test/corrections.test.ts packages/storage/test/library.test.ts apps/desktop/src/ui/components/components.test.tsx apps/desktop/src/main/meetings.test.ts`: 4 files, 154 tests, all passed.

## Plan section 9 items (tests read, not counted)

| Item | Test that fails if behavior regresses |
| --- | --- |
| 1 Thresholds | `corrections.test.ts` "needs 10 s of shared speech" (10 000 ms passes, 9 990 fails), "70% of the live speaker" (14 000 passes, 13 990 fails), "20-point margin" (exactly 20 passes, 9 990 vs 10 000 fails); "counts overlapping words once"; one-to-one: "two named speakers on one final speaker"; "spanning two finals"; ignores microphone and generic `meeting`. |
| 2 History/collision | "history" block: rebase of undo/redo and overrides, undo-vs-redo kept, unsafe entries and dependents dropped, current decisions kept; "second final pass": real `speaker-1` collision re-keyed, unrelated old `speaker-1` kept apart; `library.test.ts` reopen after repeated final pass. |
| 3 Review state | "review flag": clears on merge in either direction; stays on rename, reassign, profile matching, another pass; undo of the merge restores it; merged-away flagged speaker not listed. `library.test.ts` repeats rename (stays) and merge (clears) across reopen. |
| 4 Contract/UI | `components.test.tsx` shows "Needs review" only when `needsManualResolution` is true. |

## Specific checks

- `you` is never re-keyed: `rekeyIncoming` skips it, and `transferSpeakers` excludes it from candidates. Tests: "keeps one renamed you, never re-keys it" and "never maps you to a final meeting speaker, even with 10 s of speech reassigned to it".
- The flag clears only on a merge: see the review-flag test above. Rename, reassign, profile matching and a later pass leave it set.
- Ambiguity keeps the original record: failing-threshold cases assert the live speaker keeps `name`, `userNamed` and the flag, and the final speaker stays unnamed.

## Coverage gaps (by real risk)

- Low: the pass-through `needsManualResolution` in `apps/desktop/src/main/meetings.ts:256` (storage to contract speaker) has no test. If dropped, the marker would never reach the UI. A one-line test in `meetings.test.ts` would cover it.
- Very low: the storage reader's rejection of a non-boolean flag (`formats/transcript.ts:133`) has no test. Only hand-edited files could trigger it.
- Not covered by this note: cross-platform CI and independent code review (plan step 5 also requires them), and real-meeting suitability of the thresholds (plan section 10 "unverified").

No defect found.
