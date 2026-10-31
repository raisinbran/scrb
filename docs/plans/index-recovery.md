# Index recovery — approved narrowed startup handling

**Approval:** Owner, 2026-10-31; implement cases A, B, C and E only. **Case D (restoring a damaged live index) is deferred.** This uses Electron's native startup dialog and no new IPC or `packages/contracts/` calls.

## Invariants

- Index-only settings, profile embeddings, vocabulary, and deletion state are not reconstructable from meeting files. Never discard an unverified or sole valid copy.
- No automatic downgrade, rebuild, restoration, or overwrite. A retained `index.sqlite.upgrade-*` still counts as data remaining in delete verification.
- The single-instance startup gate owns index repair. Only an app-created snapshot with a durable, verified provenance record may be cleaned up automatically. An unowned, symlinked, mismatched or unknown copy is preserved.
- A plain or ambiguous SQLite error is **not** proof that the newer live index is good.

## Startup cases

| Case | Proof | Behavior and owner-visible result | Test |
|---|---|---|---|
| A — incomplete `.copying-*`, migration never started | App-created attempt journal, old index intact, verified phase and identity | Keep original, retry removal of the incomplete copy only if positively owned; on lock, preserve and notify | Crash/ENOSPC during copy; simulated file-lock |
| B — failed migration or failed verification | Journal and snapshot present, but live not proven sound/newer | Block library writes; native dialog: retry verification, open library folder, or keep files and close. Never restore | SQL fault, FK/integrity/row-preservation fault, crash |
| C — successful upgrade but old copy retained | Journal marked verified; newer live version, integrity/FK/schema and snapshot provenance verify | Continue using valid live index, native warning that an older copy may retain deleted data, retry bounded cleanup; report failure if file still exists | Snapshot deletion lock, restart, retry still locked |
| E — both copies bad, version newer than supported, or unowned snapshot | Read-only verification fails or version unsupported | Leave all copies unchanged; native dialog offers open library folder and close | Corrupt copies, unknown journal, future version, symlink |

## Implementation boundaries

1. Before migration, use a durable recovery record naming the app-generated attempt and phases; verify the snapshot with SQLite integrity, FK, version, and a data hash before migration.
2. On restart, inspect both indexes read-only before touching either one; compare old/new versions and row preservation. Only positively identified C may remove a snapshot after a second verification. Check removal with `lstat`.
3. Native main-process dialog before ordinary library UI: **Retry**, **Open library folder**, **Keep copies and close** for blocked cases; C can continue using the app after a warning. No renderer IPC addition.
4. Avoid paths/usernames/transcripts/profile names in logs and messages; use a neutral library location for the folder-opening action.
5. Tests use invented DB rows and injected locks. Windows AV handles, macOS locks, real power-loss and installed-app dialogs remain machine-only checks for Claude Code.

**Owner decision, 2026-10-31 (narrows case B):** after a crash before the migration commits, let SQLite roll the live index back. If it is at the old version and its rows match the hash-verified snapshot, remove the snapshot and upgrade again. If live is at the target version, sound and row-preserving, continue as case C. Anything else stays blocked.

**Explicitly excluded:** D/restoration, automatic snapshot replacement, manual restore buttons, new IPC channels, and any attempt to erase user-created backups.
