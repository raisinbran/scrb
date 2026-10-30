# @scrb/storage

Local storage for Meeting Scribe: meeting folders, `transcript.json` and `summary.json`, the
correction layer, the SQLite index, search, delete, auto-delete and logs. Node only; call it
from the app core, never from the renderer.

Run `npm test` and `npm run typecheck`.

## Layout

```
<library root>/
├── meetings/2026-10-28 Project sync/
│   ├── meeting.json        id, title, date, status: what the index is rebuilt from
│   ├── transcript.json     model text plus separate user layers
│   ├── summary.json
│   ├── audio/microphone/   audio/meeting/
│   └── exports/
├── index.sqlite            no transcript text
├── cache/<meetingId>/      files derived from a meeting, removed with it
├── models/
└── logs/scrb-YYYY-MM-DD.log
```

`meeting.json` and `cache/` are additions to the layout in the requirements. Without
`meeting.json` the index could not be rebuilt from the folders. A meeting's folder keeps its
first name when the title changes.

## API

```ts
const library = await Library.open({ root });
library.openReport;             // what the repair on open found; show or log it
library.replacedCorruptIndex;   // non-null: settings, vocabulary and profiles started empty
```

| Area | Calls |
| --- | --- |
| Meetings | `createMeeting`, `getMeeting`, `listMeetings`, `updateMeeting`, `meetingPaths`, `reconcile` |
| Import | `createMeeting({ source: 'imported', status: 'importing' })`, then `updateMeeting` to `ready`, or `discardImport` |
| Model text | `appendSegments`, `replaceLiveSegments`, `applyFinalPass`, `readTranscript`, `saveTranscript(id, doc, expectedRevision)` |
| User edits | `applyCorrection`, `revertCorrection`, `renameSpeaker`, `mergeSpeakers`, `reassignSpeaker`, `undo`, `redo` |
| Display | `resolveDisplay(transcript)`, the only way to get shown text; `activeSpeakers`, `frozenWordIds` |
| Summary | `readSummary`, `saveGeneratedSummary`, `updateSummary` |
| Search | `search(query, { fromDate, toDate, hitsPerMeeting, signal })` |
| Delete | `deleteMeeting`, `deleteAudio`; both return `{ ok, remaining }` |
| Auto-delete | `previewAutoDelete`, `runAutoDelete`, `startAutoDeleteSchedule` |
| Stores | `library.settings`, `library.vocabulary`, `library.voiceProfiles` |
| Logs | `library.logger.log(level, event, fields)`, `errorFields(error)` |
| Location | `readLibraryLocation`, `writeLibraryLocation` |

Workers must not write `transcript.json` themselves. Every change goes through `Library`, which
runs one write per meeting at a time and re-reads the file first, so a long final pass cannot
overwrite an edit made while it ran.

## Rules it enforces

**Writes.** Temp file in the same folder, flush, rename, flush the folder. A crash leaves the
old file or the new one. Stray temp files are cleared on open. An unreadable or newer-version
file raises an error and is never overwritten. Saving over an older format keeps
`<file>.v<n>.bak` once.

**Upgrades.** Files carry `schemaVersion`; `upgrades[n]` takes version n to n+1. Index steps
are in `db/migrations.ts`, one transaction each with its version bump. Never edit a shipped
step: add one, with a test from the version before it.

**Corrections.** Words in a kept correction are frozen: `applyFinalPass` keeps their IDs and
text and may only change their times. It finds where a frozen run belongs from the words around
it, falling back to time, and removes the model words it displaces. Whatever it decides, the run
stays. `verifyCorrectionsIntact` runs before the file is saved, and a failure saves nothing.

- Selecting exactly a corrected span edits it. A wider selection absorbs what is inside it.
- A selection that cuts through a correction, or spans both tracks, raises
  `CorrectionConflictError`.
- A user's names, merges and reassignments carry through the final pass.
- Undo history stops at the final pass. `revertCorrection` still works after it, and shows the
  model text kept beside the correction, which may be the live wording.

**Index.** Holds no transcript text. Vocabulary contexts are references to a correction in a
meeting file, so they leave with the meeting; `vocabularyContext(ref)` reads the words on demand.
The folders win any disagreement. `secure_delete` zeroes removed rows on disk.

**Delete.** The folder is renamed to `.deleting-<id>` in one step, then removed, along with the
cache and index rows. The check then looks for the folder, cache, index traces and any copy of
the meeting. If the folder cannot be moved the meeting stays listed and `ok` is false. A crash
mid-delete is finished on the next open.

**Auto-delete.** Counts from `createdAt` (arrival in the library), not the editable date, so an
imported old file is not removed at once. It waits while any recording runs and skips meetings
still being made. A damaged setting reads as Never. 1 year is 365 days.

**Logs.** `Logger` filters every field: numbers, booleans and short plain tokens pass; values
with spaces or slashes, and keys such as `title` or `text`, are redacted. Errors keep their name
and code only, as OS messages hold paths and paths hold titles. Files older than 14 days go.

## Why `node:sqlite`

Chosen over `better-sqlite3`, recorded 2026-10-30.

| | `node:sqlite` | `better-sqlite3` |
| --- | --- | --- |
| Install | Part of the runtime | Native addon, rebuilt for each Electron ABI on each OS |
| Electron upgrades | Nothing to do | Rebuild or matching prebuild, a release risk for a solo project |
| Tested here | Ran this package inside Electron 45.1.0 (Node 24.22, SQLite 3.53.4) | Not tried |
| Stability | Young API; prints an experimental warning on Node 22 | Mature |

The app needs a small synchronous index with no extensions, and one installer that builds on two
platforms with no native toolchain step decides it. The cost is an API that may still change, so
only `src/db/` touches it and Electron upgrades must rerun these tests. Node 22 is used for
tests here and Node 24 in the app; `@types/node` stays on 22 for now.

Rollback journal rather than WAL: the library can sit anywhere the user picks, WAL fails on
network folders, and one file makes delete easy to verify.

## Limits

- Writes rewrite the whole transcript. On a 4.4 MB, 60,000-word file a correction took 56 ms, an
  append 34 ms and a final-pass merge with 200 corrections 290 ms. Parsing runs on the calling
  thread, so run this away from the Electron main thread.
- Moving a library to a new location is not built; only the pointer is.
- The app must hold Electron's single-instance lock: two processes on one library are not guarded.
- The failure tests using `chmod` are skipped on Windows, so locked-file behaviour there still
  needs a hands-on check.
