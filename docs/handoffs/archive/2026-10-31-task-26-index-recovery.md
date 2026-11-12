# Task 26 — index-upgrade Slice B (recovery and cleanup)

**Type:** Diff. **Base main:** 7790843. **Status:** design and QA handoff; safe automatic restore requires an additional recovery identity check. Existing Slice A (Task 12) is committed but unverified.

## Current state and hard safety boundary

`packages/storage/src/db/database.ts` from Task 12 uses `VACUUM INTO` snapshots, index integrity/foreign key checks and row-preservation verification. Failed upgrades can leave `index.sqlite.upgrade-<uuid>` snapshots. Corrupt indexes now fail closed rather than silently resetting settings/profiles.

## Proposed implementation

1. On startup, enumerate only files matching the exact `index.sqlite.upgrade-<uuid>` pattern in the library root; refuse symlink/junctions. Do not silently treat a user-created backup as app-managed.
2. Verify each candidate snapshot read-only for integrity, schema version, foreign keys, and stable table row digest, without mutating the live index. Record snapshot SHA-256, source index SHA-256 (when readable), version and migration attempt in a small journal **before** running migrations.
3. If the live index is verified and newer than the snapshot, remove only verified app-created snapshots with a corresponding journal; leave unmatched copies and report them as residual data for deletion checks.
4. If index is corrupt, preserve original verbatim. Restore a snapshot **only** if the journal proves it is the exact pre-migration database and there were no post-snapshot writes; otherwise refuse automatic restoration, surface a recovery option and preserve all copies. Never fabricate index-only settings/profile embeddings.
5. Stage the restored snapshot separately, verify all semantic data, then atomically replace under exclusive app ownership. On cancellation or file errors, original remains available and error is reported.

## Failure test matrix

- Crash before snapshot, after verified snapshot, mid migration, after migration commit, and before cleanup
- Foreign-key mismatch, truncated snapshot, WAL or journal leftovers, insufficient disk, read-only/locked index
- Higher-version index cannot be downgraded; all hashes unchanged on refusal
- Orphan recovery copies are surfaced, not silently removed, and counted by Task 27 deletion checks
- Recovery never resurrects deleted meetings or silently drops user-edited vocabulary/voice profiles
- Cross-platform locked files, junctions and symlink escapes

**Decision/recommendation:** fail closed absent cryptographic proof of snapshot provenance; keep the corrupted source for explicit owner recovery. **Not implemented:** restoration/journal/cleanup and their tests. **Not run:** npm, SQLite recovery simulations, macOS/Windows filesystem checks. Task 26 is not Gate 7 complete.
