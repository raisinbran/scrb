# Task 16 — source selection and storage-location move

**Type:** source-selection Diff/tests, then storage-move Plan before implementation. Base main: `7790843`. The source-selection backend already refuses changing mic or meeting app during active capture, and existing tests assert unchanged selection remains harmless; this task adds the missing explicit mic-switch test.

## Storage move: recommended decisions for primary agent

The `pickStorageLocation(): AppSettings` contract already exists but no real main-process handler is registered. Do not interpret it as authorization for a silent migration of existing recordings.

1. **Choose then confirm.** Open a sandbox-safe native folder picker. Show existing library location and selected destination. If the new destination is empty, offer `Move library` or `Use separate empty library` **only after explicit confirmation**. Cancel makes no changes.
2. **Preserve original as fallback.** Stop recording, import, final pass, export, auto-delete and other writers before copying. Copy to a staging directory on the destination filesystem; validate free space, ownership, no symlink escapes, all manifests/chunks and SQLite integrity. Copy or SQLite-backup the index while no writer is active; never raw-copy a live index. Keep old library unchanged until validation succeeds.
3. **Atomic switch.** Set a durable migration journal in the app config outside the library, fsync destination/manifest, switch the pointer via `writeLibraryLocation` only after checks, then reopen the backend. On cancellation, crash or partial copy, keep the pointer on the old library and report the staging path. Do not silently erase the old library or any user backups.
4. **Exclusive ownership.** One migration at a time; reject nesting (moving inside self/another library), inaccessible destination, insufficient disk space, and another running app instance. Path-handling must work on Windows and macOS.
5. **UI/contract question:** the existing picker response has no progress or second confirmation field. Recommendation: keep the picker as a *selection* only until an owner-approved progress/confirmation mechanism exists. Do not fake success by returning the new settings before a verified switch.

## Required tests and outstanding gates

- Same source while recording succeeds; changed app/mic returns `conflict` with persisted selection unchanged (covered by `sources.test.ts`).
- Picker Cancel leaves settings untouched. Destination with existing user files is refused unless explicitly opted into a separate new library. All file errors leave original library usable.
- Inject crash at copy, manifest check, index backup, pointer switch, and app restart: no lost files or ambiguous active library; restart resumes or safely aborts.
- Symlink/junction, Windows locked file, cross-volume moves, and large-library progress tested on respective OSes; `npm run check` and smoke tests.

**Status:** Source selection code exists and explicit mic-switch test added. Storage picker/move implementation and its integration tests are **outstanding**, pending reviewed UX/IPC decisions above. No native or npm checks run.