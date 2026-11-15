# Plan: index upgrades

**Task 3 | Approved by owner on 2026-10-31; code not started | Baseline:** `raisinbran/scrb` `main`, commit `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a`.

## Goal and current state

Upgrade `index.sqlite` without losing meeting listings, settings, vocabulary, voice profiles, or retention state. Never modify audio, transcripts, or summaries during an index upgrade.

Existing code in `packages/storage/src/db/` already provides ordered SQLite migrations (currently version 5), one transaction/version bump per step, health checks, and refusal of newer versions. `packages/storage/test/index-db.test.ts` covers version upgrades, rollback, and corruption. **Preserve these foundations; do not rewrite shipped migrations.**

The index is *not* entirely reconstructable: meeting folders restore listing metadata, but not all settings, user-edited vocabulary, or speaker embeddings. Today, a corrupt index is moved aside and replaced, which loses this index-only state.

## Proposed changes

1. **Guard startup.** Check database health and version before upgrades or normal recording/recovery work. Leave a newer-version index untouched. Initialize a missing/empty index normally. Run upgrades under exclusive startup control.
2. **Protect the old index.** Before the first migration of an existing older index, create and validate one consistent SQLite-safe snapshot inside the selected library. Do not rely on a raw filesystem copy of an open database. If the snapshot or disk-space check fails, do not migrate.
3. **Migrate and verify.** Continue append-only, transactional `n -> n+1` migrations. Afterward, check database health, foreign keys, schema version, and preservation of IDs, settings, vocabulary links, profiles/embeddings, and deletion flags. Never add transcript text or audio to the index.
4. **Recover safely.** A crash within a step rolls back; a later launch resumes any remaining steps. Detect a crash after commit but before cleanup, and keep the valid newer index rather than restoring stale data. On corruption, restore a verified usable snapshot if possible. Otherwise preserve the damaged index, report partial-recovery limits, and **do not silently reset index-only data**. Block destructive operations until the owner accepts a recovery approach.
5. **Remove recovery copies.** After successful validation, remove the temporary snapshot and verify removal. Detect and report orphan copies. Task 4 must include these copies in meeting/profile deletion checks so backups cannot retain data the user believes deleted. Do not write sensitive values to logs.

No `packages/contracts/` changes are approved here. If recovery requires new UI/IPC behavior, propose the contract change separately before implementing it.

## Failure cases and proof

| Failure or scenario | Required test and outcome |
| --- | --- |
| Every supported old version, multiple steps, repeated launch | Seed representative rows; verify exact contents, version, and idempotence. |
| SQL error, crash within a step, crash between steps | Inject failure; reopen, check no half-applied step or lost data, then retry. |
| Insufficient space, read-only storage, snapshot error | Fail before unsafe mutation; preserve the existing index and meeting files. |
| Crash after migration commit, before cleanup | Keep valid upgraded index; safely remove or report orphan snapshot. |
| Corrupt index or unusable snapshot | Retain original; no silent loss of settings, terms, or embeddings; explicit warning. |
| Index written by a newer build | Refuse upgrade; verify database hash/version unchanged. |
| Foreign-key or semantic data mismatch | Reject success; preserve recovery path; compare profiles, terms, retention, and meetings. |
| Deletion with leftover backup | Report residual data rather than claim a complete delete (coordinate with Task 4). |

Use synthetic meetings and invented profile vectors only. Extend existing `index-db.test.ts` and `library.test.ts`; include Windows/macOS filesystem checks, not just mocked failures.

## Work split and approval decisions

- **Slice A:** guarded startup, verified snapshot, post-upgrade checks; add failure tests.
- **Slice B:** restart/corruption recovery, snapshot cleanup and warnings; integrate Task 4's deletion guarantees.
- **Review:** Claude Code applies the plan on a branch, runs `npm run check` plus relevant integration and platform tests, reviews the diff, and seeks owner approval before merge.

**Both decisions approved 2026-10-31:** (1) do not automatically perform a *lossy* rebuild when corruption affects index-only data; (2) use short-lived, verified upgrade snapshots, with leftover copies included in deletion verification.

**Not run:** `npm run check`, smoke tests, fault injection, real migration, and Mac/Windows filesystem tests. No repo files or contracts were changed. This document is a proposed plan, not tested behavior.
