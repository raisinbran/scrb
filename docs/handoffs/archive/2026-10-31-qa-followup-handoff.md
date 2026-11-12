# QA follow-up handoff — Meeting Scribe (2026-10-31)

**Repository:** `raisinbran/scrb`  
**Branch:** `rosmont/meeting-scribe-remaining-20261031`  
**Original task baseline:** `main` at `7790843dcc29951d1edc2d3fe99c25f73dddeaae`.  
**Reconciled main:** `1e89fdf270fb301e760314aeeb853bfe1895b5be`.  
**Status:** QA fixes integrated, focused follow-up commits; **do not merge this whole branch** across phase gates.

## Reconciliation

- `585cd5f`: advanced the working branch to the QA commit, preserving the 2026-10-31 QA fixes and report.
- `346eb4d`: merged subsequent `main` into the branch. Reconciled `apps/desktop/src/main/recording.ts` to retain both the privacy callback from QA and the track-specific write-error handling from `main`.

## Follow-up fixes, each committed separately

| Task | Commit | Scope | Added proof |
| --- | --- | --- | --- |
| 26 | `e589d69` | Fail closed when an `index.sqlite.upgrade-*` snapshot remains after a crash or failed validation; show a useful startup warning | Reopen with synthetic old/completed migration snapshot, preserving original/copy |
| 11 | `dc619e4` | Count recovery copies as remaining data in whole-meeting deletion; UI describes them without leaking absolute paths | Delete with an index recovery copy reports `verified:false`, retains copy |
| 21 | `0120699` | Unlink deleted profile IDs from persisted speakers and both undo/redo histories; derive last-heard date from indexed meetings, not profile edit time | Profile deletion/undo test; rename must not alter last-heard date |
| 12 | `8b89281` | Check disk space before upgrade; add fault seams proving snapshot version and preexisting rows are checked, with fail-closed restart | Insufficient-space, mismatched-snapshot, changed-row-after-migration tests |
| 36 | `2e464c` | Correct the security report's ratings and the mistaken claim that the built renderer had no CSP | Report only; no security code changed |

## Open recommendations — primary agent to decide

1. **Index recovery (Tasks 12/26):** a detected orphan upgrade snapshot blocks library startup, preserving both copies. **Recommend** a separately reviewed recovery/restore flow that can verify provenance and contents; never automatically drop the only intact index or silently delete a forensic copy. The fallback warning is user-readable but is not a repair UI. Test power loss and interrupted unlink on both OSes.
2. **Vocabulary provenance (Task 13):** another correction may still support a misheard form when one correction is undone. **Recommend** a per-correction provenance migration preserving existing user edits and deleted-term suppression. Leave its schema decision open; do not apply a lossy workaround.
3. **Speaker deletion (Task 21):** stored profile references now unlink before removing the profile row, but full atomicity across multiple meeting transcript files and SQLite is not available. **Recommend** verifying the partial-write/retry path with fault injection. Auto-name threshold remains 0.60.
4. **Security (Task 36):** QA observed built renderer CSP `default-src 'self'`. **Recommend** egress and worker-logging tests before adding a security policy. Any IPC/security changes require a separate approved plan.
5. **Contracts:** `packages/contracts/` was deliberately not changed. Task 9's exact TypeScript remains a proposal; Tasks 21/22/24/25/29 have screen-specific contract proposals. Claude Code decides the exact approved implementations with the owner where required.

## Remaining implementation gaps

The original 9–36 handoff and QA report remain authoritative on unfinished features. In particular, Tasks **15, 17, 18, 19, 30, 31, 32 and 33** remain plans/integration notes or lack executable backend/native work; **25** lacks real summary generation, **28** lacks an end-to-end DOCX/PDF export job, **26** lacks an owner-facing repair operation, and other partially completed tasks still need their stated gates and tests.

These are **outstanding**, not accepted Gate 2–8 features. Claude Code should review each task against its type and approved phase gate, then cherry-pick only verified slices.

## Verification status

The independent QA branch reported `npm run check`: **750 passed / 24 skipped** and `npm run test:smoke`: **5 passed / 1 skipped** *before* the merge and follow-up commits. These counts **do not verify this branch head**.

**Not run in this session:** `npm ci`, `npm run check`, full Vitest, `npm run format:check`, `npm run test:smoke`, Electron runtime, Windows/macOS native build or capture, installed-app tests, model/audio evaluation, 4- or 8-hour long runs. Direct `git ls-remote` from the container failed DNS resolution for `github.com`; source inspection and commits used the connected GitHub integration. Only invented test data was used.

**Next review:** run all npm checks on the merged branch, fix any type/lint/test/format failures, inspect history preservation, verify corrupted-index and delete cases, then take accepted commits through the proper phase gates. Do not merge wholesale into `main`.
