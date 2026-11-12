# Task 27 — retention scheduler and remaining deletion work

**Base main:** 7790843. On branch, the real backend starts the storage auto-delete schedule and stops it at shutdown. `Library.close()` now waits for an in-flight sweep before closing SQLite. Existing `Library.previewAutoDelete` uses library entry date (not source media date), `runAutoDelete` defers while recording, and Task 11's `deleteAudio` removes the full audio folder, session metadata and caches.

## Outstanding hardening

- The running export, import, transcription and active playback jobs need a shared meeting-scoped busy registry so deletions and auto-delete refuse **every** open writer; current status and `writer.lock` checks are insufficient for export.
- Failure to remove a `.deleting-...` tombstone must be fully recovered after restart, with verified absence of all traces. Add disk permission and crash fault injection on Windows and macOS.
- Verified upgrade backup snapshots (Task 26) and user-created duplicate folders may retain meeting data. Report them; never claim complete deletion while app-owned backup retains it. Never silently delete external copies.
- UI must explicitly warn that OS backups/filesystem histories are not physically erased, and must distinguish failed/partial delete from success.
- Auto-delete must default to Never. Add a test that closes the library during a running sweep; the current test suite covers schedules/restart boundaries but was not run.

**Recommendation:** keep fail-closed behavior when deletion cannot be proven, don't broaden sandbox paths. **Not run:** `npm run check`, retention fault injection, native filesystem tests.
