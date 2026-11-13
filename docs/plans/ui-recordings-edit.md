# Plan: edit a finished meeting in Recordings (UI only)

Status: draft, awaiting owner approval. Independent review: pending. No contract change, no new IPC names.

## Problem

The Recordings transcript (`TranscriptTab.tsx`) is read-only. The owner cannot fix a misheard word or rename a speaker on a finished meeting. Both exist elsewhere: word correction on the Live screen, per-meeting speaker rename on the Speakers screen (`MeetingSpeakers.tsx`), so nothing on the meeting itself points to them.

## What exists (reuse, do not rebuild)

- Calls already in the contract: `applyCorrection`, `getUndoState`, `undo`, `redo`, `renameSpeaker` (target = this meeting), `reassignSpeaker`. Real handlers are in `main/meetings.ts`, routed by `hybrid-backend.ts`.
- `screens/live/CorrectionEditor.tsx` (text box, "remember" option, apply/cancel) and the undo/redo state helper used by `TranscriptView.tsx`.
- `MeetingSpeakers.tsx` shows how a per-meeting rename is built (`SpeakerTarget`).
- Final-pass running: the banner already says corrections are kept, so editing stays allowed.

## Design (first slice: single-word correction, speaker rename, undo)

1. **Correct one word:** double-click a word opens `CorrectionEditor` for that word only. Multiword editing is deferred: `applyCorrection` needs first and last word IDs, and the virtualised transcript exposes only timestamps, so a range cannot be resolved reliably yet. Apply calls `applyCorrection` (also while audio plays; playback is not interrupted) and the transcript reloads.
2. **Rename a speaker:** the speaker name on each segment becomes a button; click opens an inline input; Enter calls `renameSpeaker` with the meeting-speaker target. Validation (UI, with the backend as authority): trimmed, not blank, at most 60 characters, and not equal (case-insensitive) to another speaker's name in this meeting; otherwise show an inline message and do not call.
3. **Undo/redo:** buttons beside A-/A+, plus Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z in the Transcript tab, via `getUndoState`/`undo`/`redo`. First step of the work: check in `main/meetings.ts` whether a real rename is on the Undo stack; the mock must match the real handler. If the real rename is not undoable, the UI says so ("rename again to change it back") and no Undo is promised for renames; that is not a contract change.
4. **Discoverability:** a dismissible hint above the transcript ("Double-click a word to correct it. Click a speaker name to rename them."), dismissal kept in local storage.
5. **Keys:** the Space and arrow playback shortcuts (PR #141) must be off while either editor is open, including when focus is on its Apply/Cancel buttons. Editors carry a marker the shortcut handler checks; regression test required.
6. Editing is disabled while the meeting is recording, paused or being deleted.

## Mock parity (UI-owned `mocks/`)

`renameSpeaker` in `mock-backend.ts` currently also renames the linked global voice profile, which the real backend does not (it scopes the rename to the meeting and persists). Fix the mock to change the meeting's speaker only and, if the real rename is undoable, enter it in the transcript Undo stack.

## Where it lives

`TranscriptTab.tsx` (handlers, hint), a small `RecordingsCorrection` helper and `use-meeting-undo` hook in `screens/recordings/`; `CorrectionEditor` imported from `screens/live/` (UI to UI, allowed). Colours stay in tokens.

## Risks

- Virtualised rows: the editor must anchor to a row that may scroll out; reuse the Live screen's placement logic or place it as a fixed panel under the player.
- Reload after an edit must keep scroll position and playhead.
- If `getTranscript` does not reflect a correction until the final pass ends, write a handoff note in `docs/handoffs/` and stop on that part.

## Tests and verification

- Mock-backend UI tests: single-word double-click edit shows the corrected word, also during playback; speaker rename updates all rows and leaves voice profiles unchanged; blank, too-long and duplicate names are rejected; Undo of a correction (and of a rename if real rename is undoable); Undo after switching meeting acts on the right meeting; Ctrl/Cmd+Z ignored in text fields; playback keys ignored with an editor open, including on Apply/Cancel; hint dismissal.
- Storage-backed test in the main-process suite against the real handlers and library on a temp directory: a correction and a rename persist after reopening the library, and a rename in one meeting does not touch another meeting or any voice profile.
- Relaunch persistence is verified by that reopen test plus a manual check with `scripts/m1.sh` (edit, quit, relaunch). `npm run check` and `npm run test:smoke` must pass, with their output in the PR.

## Effort

About 6 to 8 hours of agent work in one PR (single-word editor, rename with validation, undo, mock parity, storage-backed test).
