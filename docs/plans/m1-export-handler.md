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

## Handler flow

1. `exportMeeting(request)` runs these checks before returning, so the dialog shows them as a failed start: meeting exists (`requireMeeting`, else `notFound`); `content` is `transcript` (else `conflict`, "Summaries can't be exported yet."); status is not `transcriptionFailed` and a transcript is readable (else `conflict`, "This meeting has no transcript to export yet.").
2. Make `exportId` (`crypto.randomUUID()`), start the job, return `{ exportId }` at once. The dialog already copes with the event arriving before the response.
3. Job: read `library.readTranscript(id)` and the meeting; map to `ExportMeeting`; `buildExportDocument(meeting, { scope: 'transcript', transcript: request.transcript })`; `renderDocx` or `renderPdf`.
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
- `new BrowserWindow({ show: false, webPreferences: printWebPreferences() })`: context isolation on, sandbox on, node integration off, webview off, JavaScript off, **no preload** (so no bridge to the backend).
- A private in-memory session (`session.fromPartition('print-<id>')`, no `persist:`): `webRequest.onBeforeRequest` cancels everything except the one `file://` URL; permission handlers deny all; `will-navigate` prevented; `setWindowOpenHandler` denies; `will-attach-webview` prevented. `lockDownContents` in `security.ts` covers the last three, so reuse it with the file's origin.
- `loadFile`, `webContents.printToPDF(options)`, `window.destroy()` in `finally`; a 60 s timeout fails the export.
- A test greps the generated HTML for `http:`, `https:`, `<script`, `<link` and `<img src=`; the package should already produce none, and the test makes that a promise.

DOCX: `renderDocx` is CPU work; the package says to keep it out of the main process. For M1 it runs in main. The package's performance test covers an 8-hour meeting, and the e2e measures a real one. If it blocks the window for more than about a second on a normal meeting, move it to a `utilityProcess` as a follow-up; do not build that now.

## Errors

All after-start failures become `exportFinished { ok: false, message }` with plain text and no paths: disk full ("Not enough disk space."), print timeout or crash ("The PDF could not be created. Try DOCX."), anything else ("The export failed."). Details go to `library.logger` with `errorFields`, never to the renderer. `ExportInputError` cannot occur for transcript scope with valid dates; if it does, it takes the generic message. Meeting deleted mid-export: the write fails and the same event is sent. App quit mid-export: a stray `.part` or `.print-*.html` may remain in that meeting's `exports`; the next export of the same meeting removes any `.part`/`.print-*` older than a day. Skipped otherwise.

## Tests

- **Unit** (`export.test.ts`, fake `print`, temp-directory library like `meetings.test.ts`): file lands in `exports` with a DOCX header (`PK`) or the fake PDF bytes; event carries `ok: true` and the base name; hostile title (`../../x`, slashes, empty) stays inside `exports`; two exports of one meeting do not overwrite; missing meeting gives `notFound`; `summary` and `both` give `conflict`; failed meeting gives `conflict`; `print` throwing gives `ok: false`, no `.part`, no temp HTML; mapping keeps the original text of a corrected word when `showCorrections` is on; gaps become markers; `exportFinished` fires after the response resolves or before, both fine.
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

About 6 to 7 hours: bundling spike 1, handler and mapping 2, PDF window and preferences 1.5, unit tests 1, e2e 1, review fixes 0.5. One PR, backend only.

## Owner decisions needed

1. Approve the plan (hidden print window; no contract change).
2. Confirm "transcript only, fixed exports folder, no Save as dialog" is enough for M1.

Agent usage row: not yet logged for this plan (quota not measured in this session); to be appended to `agents/agent_task_allocation.md` by the session that owns it.
