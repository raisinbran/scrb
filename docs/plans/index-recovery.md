# Index recovery — failed upgrades and retained snapshots (Gate 2 QA exception)

**Type:** Plan only; no code or `packages/contracts/` changes. **Basis:** current `packages/storage/src/db/database.ts`, Task 3/26 plans, and `2026-10-31-qa-followup-review.md`. Owner approval is for this plan; later recovery implementation and any new contract remain open for primary-agent review.

## Safety rule

The SQLite index contains settings, vocabulary, speaker embeddings and deletion state that **cannot** be reconstructed from meeting folders. Preserve the original index and every potentially useful snapshot on uncertainty. Never automatically discard the only intact copy, silently roll back post-upgrade edits, or resurrect a deleted meeting.

## Minimal recovery flow

1. **Label copies before migrating.** Under the app's single-instance/startup lock, `VACUUM INTO index.sqlite.copying-<id>`, verify integrity/foreign keys/version, and only then rename to `.upgrade-<id>`. Before the first migration commit, persist a tiny durable, app-owned recovery record containing attempt ID, old and target versions, SHA-256 of the verified snapshot, and phase (no user content). Flush it before starting the migration. Treat a mismatched/unowned copy as **untrusted**, not automatically disposable. Keep `.copying-*` cleanup for pre-migration failures; report Windows sharing violations rather than suppress them.
2. **Examine both copies read-only on restart.** Verify existence, file ownership/type, integrity, foreign keys, `user_version`, expected schema, record digest and hashes. Compare stable IDs and row content for meetings (including `audio_deleted_at`), settings, vocabulary and profiles; also inspect whether the current index has writes beyond the old snapshot. A valid newer live index with a matching recovery record and preserved rows is the **preferred copy**. When validation after a migration failed, or the newer index is corrupt, do not infer that the older copy is authoritative solely from its version.
3. **Classify rather than automatically roll back.** (A) Copy never verified / no migration started: keep the live original, discard only positively identified incomplete copy when unlocked, retry. (B) Migration failed or post-migration validation failed: preserve live and snapshot, block library writes, present a review/recovery choice. (C) Upgrade verified, but removing `.upgrade-*` failed (Windows AV `EPERM`, `EACCES`, `EBUSY`, antivirus-held handles): keep valid newer live index; report retained copy, retry bounded cleanup on a later startup after rechecking its identity; do not roll back. (D) Live index damaged, valid snapshot: offer verified restoration only after checking journal identity and absence of later writes/deletions; otherwise owner-directed recovery with both files preserved. (E) Both invalid or a newer-version index: preserve unchanged, block destructive actions, provide manual assistance.
4. **User-facing outcome.** Startup dialog states clearly either “Library unavailable: recovery needed” or “Library available: old index copy could not be removed.” Show a neutral file location, what was preserved and whether meeting deletion can be verified. Offer **Retry verification/cleanup**, **Open library folder**, **Keep copies and close**, and **Restore verified copy** only when strictly proven safe. Never claim a copy was removed until `lstat` proves absence. No paths, profile names or meeting titles in logs.
5. **Retained deleted-meeting data.** Existing `deleteMeeting` must continue reporting `verified:false` while any `.upgrade-*` copy exists; a snapshot may contain a deleted meeting or profile even if the live index does not. During approved cleanup, reverify snapshot identity and the newer live index; remove *only that verified, app-created* snapshot, then check absence. Do not modify a retained copy in-place or silently delete user-created backups. Where cleanup is impossible, show “index recovery copy still retains older data” and keep a retry path.

## Failure cases and required tests

| Failure | Synthetic proof |
| --- | --- |
| Crash/ENOSPC during `.copying` | Index hash unchanged; no migration; partial copy only cleaned when known app-created and not held |
| Incomplete/corrupt/mismatched snapshot | Reject and preserve original; no false “good snapshot” |
| Power loss after verified snapshot, before first commit | Journal matches; live old version unchanged; safe retry without loss |
| SQL error / crash during a migration step | Transaction remains whole at last version; live and snapshot retained; restart does not silently select a copy |
| Post-migration integrity, foreign-key or row-preservation failure | Old copy intact, writes blocked, recovery action visible |
| Successful upgrade but crash before cleanup | Valid newer live index is retained, not rolled back; stale snapshot identified by journal |
| Snapshot deletion denied by Windows AV or OS lock | Newer index remains usable if validated; residual copy warning, later retry, no false deletion success |
| Retry cleanup also fails | Bounded attempts and no exception swallowing; both files still visible |
| Unowned copy or symlink/junction at snapshot path | Refuse automatic cleanup/restoration; paths must remain within owned library |
| Corrupt live index, good verified copy | Restore offered only with proven provenance/no later writes; staged restore itself verified, original retained |
| Valid live index with post-snapshot user changes | No automatic downgrade; newer settings/profiles/deletion flags survive |
| Deleted meeting/profile still in backup | Delete check reports remaining old index data; no success until verified snapshot removal |
| No writable space / readonly volume / indexed version newer than app | No mutation and actionable safe warning |
| Windows file locks / macOS interruption | Run real file-handle denial and interrupted-cleanup tests on each OS; do not substitute Linux tests |

**Test placement:** `packages/storage/test/index-db.test.ts` for journal/version/validation/lock fault seams; `packages/storage/test/library.test.ts` for delete and retention; Electron startup smoke for owner dialogs. No actual meetings or private profile vectors.

## Contract decision (open)

**Recommendation:** start with a native main-process dialog before the renderer/backend opens, avoiding an IPC expansion for a startup-only failure. If recovery must run from a regular UI screen, **do not implement until the owner approves** this exact candidate:

```ts
type IndexRecoveryState = {
  kind: 'none' | 'cleanupBlocked' | 'recoveryRequired';
  liveValid: boolean;
  verifiedSnapshot: boolean;
  message: string; // Safe human-readable text, no filesystem paths or user data
};
type IndexRecoveryAction = 'retryVerifiedCleanup' | 'openLibraryFolder' | 'keepAndClose';
// Proposed BackendCalls extension, not applied:
getIndexRecoveryState: { request: void; response: IndexRecoveryState };
resolveIndexRecovery: {
  request: { action: IndexRecoveryAction };
  response: IndexRecoveryState;
};
// Restore is NOT in this generic action: it needs its own separately approved flow.
```

If adopted, add exact `CALL_TABLE`, `REQUEST_CHECKS`, mock, IPC allowlist and tests together.

**Not run:** `npm run check`, Prettier, smoke, fail-injection tests, Windows AV locks, native/macOS tests. Plan only; no claims of completed recovery implementation.
