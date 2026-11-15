# Plan: native save dialog for Export

**Status:** draft for owner approval, independent review pending. Plan only, 2026-11-15, written against `main` at `f258188f`. Nothing was run. Owner feedback item 29 (`docs/handoffs/owner-feedback-real-meeting-20261114.md`).

**In plain words**

1. Clicking the final Export button opens the normal Mac or Windows "Save as" window, starting in the folder you used last time. The app shows no save-location menu of its own.
2. This needs two small, additive contract changes and a change to the Electron main process, which the Development Process lists as risky (IPC), so it needs your approval first.
3. Two slices, one PR each: single-file export first, then the folder picker for "transcript plus summary" once summaries can be exported.

## How export works today

- `ExportDialog.tsx` collects content (transcript, summary, both), format (docx, pdf, vtt) and options, then calls `exportMeeting` with ids and options only. No path is in the request or in `validate.ts`.
- `apps/desktop/src/main/export.ts` checks the meeting, returns `{ exportId }` at once, renders in the background (DOCX in a worker, PDF in a hidden print window, VTT as text) and writes into `<library>/<meeting>/exports/<title>-<date>.<ext>` through `writeUnique`, which never overwrites (adds ` (2)`). It then emits `exportFinished { ok, fileName }` (base name only).
- The done screen says "Saved X in the meeting's exports folder" and its Open folder button calls `openMeetingFolder('exports')`.
- Real summary export is rejected today ("Summaries can't be exported yet", `export.ts`), so only transcripts export. See `summaries-gap-audit.md`.
- The app already uses `dialog.showOpenDialog` for importing audio (`backend.ts`), so a dialog is not new in main.

## Design

**The dialog runs in the main process, inside the export job.** The renderer never sends or learns a path before the OS dialog; the only path that reaches code is the one the OS dialog returns to main. `ExportRequest` and `validate.ts` stay as they are.

Flow for one file (docx, pdf or vtt):

1. `exportMeeting` validates exactly as now, returns `{ exportId }`, then the job opens `dialog.showSaveDialog(parentWindow, …)`. Dialog first, render second, so a cancel wastes no work.
2. Options: `defaultPath = <startDir>/<exportFileStem>.<ext>` (the existing safe stem), a filter for the chosen format only, `createDirectory`, `showOverwriteConfirmation`. The parent is the main window (a sheet on Mac); if it is gone the export fails with "The window was closed."
3. `startDir` is the last folder used for a Scribe export, else the meeting's own `exports` folder (today's behaviour, so first use looks familiar). If the remembered folder no longer exists, fall back silently to the meeting's `exports` folder.
4. After the user confirms: force the chosen extension (append it if missing), render, write `<name>.part` in the **same folder**, then rename over the target. Overwrite was confirmed by the native prompt, so `writeUnique`'s never-overwrite rule applies only to the unprompted fallback and to the folder-picker case below. A failed write leaves any older file untouched.
5. Remember the folder: `dirname` of the chosen path, saved only after a successful write.
6. `exportFinished { ok: true, fileName }` as today.

**Remembering the location.** A small JSON file `export-location.json` in `app.getPath('userData')` (the pattern `mini-window.json` already uses), read and written only in main, holding one string. Not in `AppSettings`, not in the library database: it is a machine path that should not travel with a moved or restored library, and it needs no contract change. A missing, unreadable or non-directory value counts as unset.

**Cancel.** The native Cancel writes nothing and leaves no `.part` and no temp file. The UI returns to the options screen with no error text. Closing the app during the dialog ends the job like any quit mid-export (the existing stale `.part` sweep applies).

**Several files** (slice 2, only when summary export exists): "Both", or later several formats, opens a folder picker (`openDirectory` plus `createDirectory`) with the same start folder. Files are `<stem> transcript.<ext>` and `<stem> summary.<ext>`, written with `writeUnique` (never overwrite, ` (2)` on clash) because a folder picker has no per-file overwrite prompt. The result names the files saved. If one of two files fails, the finished event says which saved and which did not; the saved one is kept.

## IPC and contract: exactly what changes

Needs owner approval (`packages/contracts/` and security-sensitive IPC). Nothing here changes the one call channel, the one event channel, or how the allowlists are built (names derive from `CALL_TABLE`/`EVENT_TABLE`; slice 1 verifies preload and main still match with the existing `ipc.test.ts` and `contract.test.ts`).

| Change                                                                                                     | Why                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ExportFinished`, failed variant: add optional `cancelled?: true`                                          | UI must tell "user cancelled" from "failed". No new event name.                                                                                                                                                                                                                                                             |
| New call `revealExport: { request: { exportId }; response: void }` (add to `CALL_TABLE` and `validate.ts`) | "Open folder" can no longer assume the meeting's exports folder. Main keeps a small map `exportId → saved path` (last 20, this run only) and calls `shell.showItemInFolder`. The renderer sends only the id it was given, never a path, and cannot reveal anything the app did not just write. Unknown id gives `notFound`. |

No other contract change. The done text becomes "Saved X." plus a **Show in folder** button calling `revealExport`; `openMeetingFolder('exports')` stays for the Recordings screen. If the owner declines `revealExport`, the done screen simply has no folder button (smaller, worse).

Alternative considered and rejected: a response `{cancelled}` on `exportMeeting` (would make the call block on a dialog and change an existing response type).

## Files (code, after approval)

`apps/desktop/src/main/export.ts` (dialog step, atomic write to chosen path); new `export-location.ts` (read and write the remembered folder, small and testable); `backend.ts` (inject `chooseSavePath`, `revealPath` using Electron); contract and `validate.ts` for the two changes above; `apps/desktop/src/ui/mocks/mock-backend.ts` and `ExportDialog.tsx` (cancel returns to options; Show in folder; wording). No change to `web-preferences.ts`, `security.ts`, or window settings. `dialog` is not a renderer capability.

## Tests

- **Main, stubbed dialog** (`export.test.ts`, the existing temp-directory setup; dialog injected, as `chooseFile` already is for imports): chosen path in a temp folder receives the file; missing extension is appended; cancel gives a `cancelled` event, no file, no `.part`, no remembered folder change; stub returns an existing file, so it is replaced and a failure mid-write keeps the old bytes; remembered folder is used next time and ignored when deleted; a path the stub returns with a different extension or a directory is refused; unwritable folder gives "Couldn't save there."; `revealExport` with an unknown or stale id (for example after the file was removed) gives `notFound`, with a real id calls the injected reveal with the saved path only.
- **Contract and IPC:** `contract.test.ts`, `ipc.test.ts`, `validate.test.ts` updated for the new name and field; a test that `exportMeeting`'s request shape still has no path field.
- **UI against the mock:** cancel returns to the options screen with no error; success shows Show in folder; failure unchanged.
- **Manual, not CI:** the real native dialog cannot be driven headless. One owner or Regiurn check on a packaged Mac and a packaged Windows build (about 10 minutes each; if setup and cleanup make a combined run likely to exceed 20 minutes, get approval first): pick a new folder, export, export again (dialog opens there), overwrite prompt, cancel, long path, Show in folder.
- `npm run check` and `npm run test:smoke` first.

## Mac and Windows

- Mac: the dialog is a sheet on the window and prompts for overwrite itself; `showOverwriteConfirmation` is ignored there. Documents-folder access prompts are OS-level and apply to the user's own picks.
- Windows: `showOverwriteConfirmation` is needed; paths over 260 characters and reserved names are the dialog's job, our stem already strips `\ / : * ? " < > |`. Folder picker has a built-in New folder button. OneDrive folders work like any folder.
- Both: the app is not sandboxed, so any folder the user picks is writable if the OS allows it.

## Slices (one PR each)

1. Single-file export through the native dialog, remembered folder, `cancelled`, `revealExport`, mock and UI wording. Needs contract approval. About 8 to 10 hours.
2. Folder picker for multi-file exports. Starts once summary export exists. About 3 to 4 hours.

## Owner decisions

1. Approve the two contract additions (`cancelled` and `revealExport`). Without `revealExport` there is no folder button. **Recorded 2026-11-15:** approved for implementation after independent review of this plan; relayed by the planning session from the owner's chat decision, so the owner should confirm it on this PR.
2. First-use folder: the meeting's own `exports` folder (recommended, today's behaviour) or one library-wide `Exports` folder?
3. Remember one folder for all exports (recommended) or one per meeting?
4. Multi-file naming `<stem> transcript` and `<stem> summary` in a chosen folder: acceptable?

## Risks

- Dialog blocks nothing in the main process (`showSaveDialog` is async), but the UI shows "Exporting…" while the dialog is open; the wording becomes "Choose where to save…".
- Writing to the user's chosen folder is the first time the app writes outside the library; the write is a plain file in the folder the user picked, never executes anything, and keeps the temp-then-rename pattern.
