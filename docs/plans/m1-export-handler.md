# Plan: real `exportMeeting` handler (M1 task 1)

**Status:** plan only, 2026-11-13. **Independent review: pending.** Owner approval needed before code, because it adds a hidden Electron window (security settings are on the Development Process risky list). Task 1 of `docs/plans/m1-readiness.md`. Based on `main` at `097f252`; nothing was run.

## Goal

A real meeting's Export button writes a DOCX or PDF transcript into the meeting's own `exports` folder and reports it through `exportFinished`. Today the call has no handler, so `dispatch.ts:32` answers "not available yet".

## Findings that shape the plan

- **No contract change.** `ExportRequest` carries only ids and options, no path. `ExportFinished` returns a bare `fileName`. The dialog already says "Saved X in the meeting's exports folder" and its Open folder button calls `openMeetingFolder('exports')`, which already exists and is confined to the library root. So the save location is fixed by the app: `library.meetingPaths(id).exports`. No renderer-supplied path ever exists, so there is nothing to validate beyond the file name we generate. A "Save as…" dialog would need a new field, so it is out of M1.
- **Routing is done.** `hybrid-backend.ts` already lists `exportMeeting` and `exportFinished` as real for real meetings. No UI or script change, so no clash with the mock-marker session.
- **Summaries cannot be exported for real meetings yet.** `generateSummary` has no handler and `toListItem` reports `summaryState: 'notGenerated'`, so the dialog disables Summary and Both. M1 is transcript only; the handler rejects the other two plainly.
- **PDF printing is injected.** `renderPdf(doc, print, opts)` calls `print(html, options)` and the package never imports Electron. `renderDocx(doc, opts)` returns bytes. `buildExportDocument(meeting, request)` is shared. Package README: load long HTML from a file, not a `data:` URL; delete it afterwards; JavaScript off in the print window.
- **Bundling.** `@scrb/export` has `main`/`exports` pointing at `dist/`, which is not built by `npm run build` (storage points at `src`). Desktop does not depend on it yet.

## Files

| File                                          | Change                                                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/src/main/export.ts` (new)       | `createExportHandlers({ library, emit, print })` returns `{ exportMeeting }`. Pure of Electron: `print` is injected, so unit tests use fakes.                                                                                |
| `apps/desktop/src/main/export-print.ts` (new) | The Electron `PrintHtmlToPdf`: hidden window, below. The only new file importing `electron`.                                                                                                                                 |
| `apps/desktop/src/main/web-preferences.ts`    | Add `printWebPreferences()`: same four locked settings, no preload, `javascript: false`. Extend `web-preferences.test.ts`.                                                                                                   |
| `apps/desktop/src/main/meetings.ts`           | Export `requireMeeting` and `timelineGaps` (currently private). No behavior change.                                                                                                                                          |
| `apps/desktop/src/main/backend.ts`            | Spread `...createExportHandlers(...)` next to `createMeetingHandlers`. Passes `print` from `export-print.ts`.                                                                                                                |
| `apps/desktop/package.json`, lockfile         | Add `"@scrb/export": "*"`.                                                                                                                                                                                                   |
| `apps/desktop/scripts/build-electron.mjs`     | Resolve `@scrb/export` to `../../packages/export/src/index.ts` (esbuild `alias`), as `liveWorkerEntry` already reaches into `packages/`. `docx` is bundled into `main.cjs`. Alternative: point the package exports at `src`. |
| `apps/desktop/src/main/export.test.ts` (new)  | Unit tests, below.                                                                                                                                                                                                           |
| `apps/desktop/e2e/real-export.spec.ts` (new)  | Opt-in real-mode spec, below.                                                                                                                                                                                                |

Not touched: `packages/contracts/`, `ipc.ts`, `dispatch.ts`, `security.ts`, `preload`, anything under `src/ui/`, `scripts/` other than the build script. No new IPC channel or name.

Also new: `apps/desktop/src/main/exportWorkerEntry.ts` (the DOCX worker, below).

## Handler flow

1. `exportMeeting(request)` runs these checks before returning, so the dialog shows them as a failed start: meeting exists (`requireMeeting`, else `notFound`); `content` is `transcript` (else `conflict`, "Summaries can't be exported yet."); status is `ready`, `recovered` or `finalPassRunning` (not `recording`, `importing` or `transcriptionFailed`); then read the transcript and require at least one displayed word (else `conflict`, "This meeting has no transcript to export yet."). The word check is needed because `library.readTranscript` returns an empty transcript, not an error, when no transcript file exists (`library.ts:372-375`), so a status check alone would export an empty document. A `finalPassRunning` meeting with live text still exports, marked provisional.
2. Make `exportId` (`crypto.randomUUID()`), start the job, return `{ exportId }` at once. The dialog already copes with the event arriving before the response.
3. Job: using the transcript read in step 1; map to `ExportMeeting`; `buildExportDocument(meeting, { scope: 'transcript', transcript: request.transcript })`; `renderDocx` (in a worker, below) or `renderPdf`.
   - `title`, `startedAt` (`meeting.date`), `durationMs`.
   - `speakers`: `activeSpeakers(t)` as `{ id, name: name ?? label }`.
   - `segments`: `resolveDisplay(t)`, ordered by first token `startMs` across both tracks; each token becomes `{ text, original: originalText }` (`original` only when set). Check the spacing rule (parts are concatenated verbatim) against a real transcript before coding.
   - `markers`: `timelineGaps` with `paused` as `pause`, the other kinds as `gap`; a `recovered` meeting adds `recording-ended` at `durationMs`.
   - `transcriptProvisional`: true if any segment has `pass !== 'final'`.
4. Write: `mkdir -p exports`, file name `<title with unsafe characters removed, max 60 chars>-<YYYY-MM-DD>.<ext>` (title `transcript` if empty), written as `<name>.part` with flag `wx` then renamed; on a name clash add ` (2)`, ` (3)`. The name is generated here and never contains a separator; `realpath` of the folder must stay under the library root (same check as `openMeetingFolder`).
5. Emit `exportFinished { ok: true, fileName }` (base name only, no path).

## PDF printing (the risky part)

`export-print.ts`:

- Write the HTML to `exports/.print-<exportId>.html` (not `data:`, per the package README); delete it in `finally`, even on failure.
- Create the restricted session first: `const ses = session.fromPartition('print-<exportId>')` (no `persist:`, so in memory). On it: `webRequest.onBeforeRequest` cancels every request except the one page URL (exact string match to the `file://` URL of the temp file, so other `file://`, `http(s)`, `data:` and `ws:` are all cancelled); permission request and check handlers deny all.
- Bind it explicitly: `new BrowserWindow({ show: false, webPreferences: { ...printWebPreferences(), session: ses } })`, then throw if `win.webContents.session !== ses`. (`session` is a documented `webPreferences` option; without it the window would use the default session and the filters above would not apply.) `printWebPreferences()`: context isolation on, sandbox on, node integration off, webview off, JavaScript off, **no preload**.
- Navigation: `will-navigate` and `will-redirect` always `preventDefault` (stricter than `lockDownContents`, which allows same-origin and would allow other local files); `setWindowOpenHandler` denies; `will-attach-webview` prevented. Not reusing `lockDownContents` for that reason.
- `loadURL(pageUrl)`, `webContents.printToPDF(options)`, `window.destroy()` in `finally`; a 60 s timeout fails the export.
- Tests: the request filter and navigation guards are small pure functions with unit tests (page URL allowed; any other `file://`, `http(s)`, `data:` denied). The e2e prints an HTML fixture containing a remote `<img>` and a second local file reference and asserts neither loads. A test also greps the generated HTML for `http:`, `https:`, `<script`, `<link` and `<img src=`; the package should already produce none, and the test makes that a promise.

DOCX: `packages/export` says `renderDocx` is CPU work to keep out of the main process, so it runs in a **`worker_threads` worker**, not main. Decision: worker thread rather than `utilityProcess`, because it needs no Electron API, is unit-testable under Node, and the build script already bundles `liveWorkerEntry.mjs` the same way. New entry `apps/desktop/src/main/exportWorkerEntry.ts`, bundled to `exportWorkerEntry.mjs` by `build-electron.mjs` with the alias, takes `{ meeting, request, pageSize }`, calls `buildExportDocument` + `renderDocx`, and transfers the bytes back. `export.ts` takes the renderer as an injected function, so unit tests use a fake and one test runs the real worker on a generated 1-hour transcript (about 10,000 segments, invented) to check bytes come back and the main thread's event loop keeps ticking (a 50 ms timer must never be late by more than 250 ms). A 60 s timeout terminates the worker and fails the export. PDF HTML is built in main (string work, small next to docx); if the e2e shows a stall, move that into the same worker.

## Errors

All after-start failures become `exportFinished { ok: false, message }` with plain text and no paths: disk full ("Not enough disk space."), print timeout or crash ("The PDF could not be created. Try DOCX."), anything else ("The export failed."). Details go to `library.logger` with `errorFields`, never to the renderer. `ExportInputError` cannot occur for transcript scope with valid dates; if it does, it takes the generic message. Meeting deleted mid-export: the write fails and the same event is sent. App quit mid-export: a stray `.part` or `.print-*.html` may remain in that meeting's `exports`; the next export of the same meeting removes any `.part`/`.print-*` older than a day. Skipped otherwise.

## Tests

- **Unit** (`export.test.ts`, fake `print`, temp-directory library like `meetings.test.ts`): file lands in `exports` with a DOCX header (`PK`) or the fake PDF bytes; event carries `ok: true` and the base name; hostile title (`../../x`, slashes, empty) stays inside `exports`; two exports of one meeting do not overwrite; missing meeting gives `notFound`; **no transcript file, a transcript with no words, and `recording`/`importing`/`transcriptionFailed` status each give `conflict` and no file or event**; `summary` and `both` give `conflict`; failed meeting gives `conflict`; `print` throwing gives `ok: false`, no `.part`, no temp HTML; mapping keeps the original text of a corrected word when `showCorrections` is on; gaps become markers; `exportFinished` fires after the response resolves or before, both fine.
- **Unit**: `printWebPreferences()` has the four locked values, no preload, JavaScript off; generated HTML has no remote references.
- **E2E** (`real-export.spec.ts`, same opt-in env and AMI fixture as `real-import-playback.spec.ts`): import, open Export, choose DOCX then PDF; assert both files exist in the meeting's `exports`, `%PDF-` and `PK` headers, and that Open folder still works. Skipped where the real-mode variables are unset, like the other real specs. If the import fixture makes it too slow for CI, it stays owner-run.
- The existing `ExportDialog` UI test is unchanged and stays valid (the contract and UI do not change).
- `npm run check` and `npm run test:smoke` before review. No test here is expected to exceed 20 minutes.

## Risks

- **Security window:** a new window is the only added attack surface. Mitigated by the locked preferences, no preload, no network, JavaScript off, file deleted after. The reviewer should check this section line by line.
- **Bundling:** `docx` and the `.js`-suffixed TS imports under esbuild/vitest/tsc may need the alias or the exports change; the first hour confirms which.
- **Speaker and time mapping** is the likeliest source of a wrong-looking export (word spacing, two-track ordering). The e2e output should be opened once by the owner.
- **Summaries missing** in exports until a summary generator exists; stated in the dialog error, not hidden.
- **Packaged builds:** not covered; the handler is not env-gated, so it works there too, but the package script is still Phase 8.

## Size

About 7 to 8 hours: bundling spike 1, handler and mapping 2, docx worker 1, PDF window and preferences 1.5, unit tests 1, e2e 1, review fixes 0.5. One PR, backend only.

## Owner decisions needed

1. Approve the plan (hidden print window; no contract change).
2. Confirm "transcript only, fixed exports folder, no Save as dialog" is enough for M1.

Agent usage row: not yet logged for this plan (quota not measured in this session); to be appended to `agents/agent_task_allocation.md` by the session that owns it.
