# Plan: edit a finished meeting in Recordings (UI only)

Status: draft, awaiting owner approval. Independent review: pending. No contract change, no new IPC names.

## Problem

The Recordings transcript (`TranscriptTab.tsx`) is read-only. The owner cannot fix a misheard word or rename a speaker on a finished meeting. Both exist elsewhere: word correction on the Live screen, per-meeting speaker rename on the Speakers screen (`MeetingSpeakers.tsx`), so nothing on the meeting itself points to them.

## What exists (reuse, do not rebuild)

- Calls already in the contract: `applyCorrection`, `getUndoState`, `undo`, `redo`, `renameSpeaker` (target = this meeting), `reassignSpeaker`. Real handlers are in `main/meetings.ts`, routed by `hybrid-backend.ts`.
- `screens/live/CorrectionEditor.tsx` (text box, "remember" option, apply/cancel) and the undo/redo state helper used by `TranscriptView.tsx`.
- `MeetingSpeakers.tsx` shows how a per-meeting rename is built (`SpeakerTarget`).
- Final-pass running: the banner already says corrections are kept, so editing stays allowed.

## Design

1. **Correct a word:** double-click a word (or select several words, then Enter or an "Edit" button) opens `CorrectionEditor` next to that range. Apply calls `applyCorrection`, then the transcript reloads (`use-transcript`). Corrected words already render with `wordCorrected`.
2. **Rename a speaker:** the speaker name on each segment becomes a button; click opens a small inline input; Enter calls `renameSpeaker` for this meeting and reloads. All segments of that speaker update.
3. **Undo/redo:** Undo and Redo buttons beside the A-/A+ controls, plus Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z in the Transcript tab, using `getUndoState`/`undo`/`redo`. Ignored while a text field has focus. Buttons are disabled when there is nothing to undo.
4. **Discoverability:** one muted hint line above the transcript: "Double-click a word to correct it. Click a speaker name to rename them." Dismissible, remembered in local storage. Speaker names and words get a hover cursor/underline.
5. Word click only moves the playhead (PR 1), so double-click does not start audio.
6. Disabled while the meeting is recording/paused (already shown as live-only) or being deleted.

## Where it lives

`TranscriptTab.tsx` (handlers, hint), a small `RecordingsCorrection` helper and `use-meeting-undo` hook in `screens/recordings/`; `CorrectionEditor` imported from `screens/live/` (UI to UI, allowed). Colours stay in tokens.

## Risks

- Virtualised rows: the editor must anchor to a row that may scroll out; reuse the Live screen's placement logic or place it as a fixed panel under the player.
- Reload after an edit must keep scroll position and playhead.
- If `getTranscript` does not reflect a correction until the final pass ends, write a handoff note in `docs/handoffs/` and stop on that part.

## Tests

Mock-backend tests: double-click edit applies and shows corrected word; speaker rename updates all rows; undo/redo and Ctrl/Cmd+Z; shortcuts ignored in text fields; hint dismissal. `npm run check` and `npm run test:smoke`.

## Effort

About 4 to 6 hours of agent work in one PR.
