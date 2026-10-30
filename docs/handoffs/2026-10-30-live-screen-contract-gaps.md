# Live screen: contract gaps

- [ ] From the Live screen UI session to the owner (contract approval) and the backend.
- [ ] Needed: the Live screen works on the approved contract as it stands, but these items are undefined or missing. No contract file was changed.
- [ ] Contract items affected:
  - **Undo state on load (missing).** `UndoState` only comes back from `applyCorrection`, `reassignSpeaker`, `undo` and `redo`. After an app reload, Undo and Redo stay disabled until the next edit, even when history exists. Proposal: `getUndoState({ meetingId })`.
  - **`selectSources` while recording (undefined).** The UI leaves both pickers enabled, because the requirements prompt for a device switch mid-meeting. If the meeting app cannot change mid-recording, the backend should reject that with `conflict`, and the UI shows the message and restores the old choice.
  - **Levels while idle (undefined).** The requirements list a mic test, but `levelMeter` is only known to fire while recording, so the Live meters stay empty when idle. Say whether the event fires while idle or add a mic-test call.
  - **`replace` semantics (undefined).** The UI treats a segment id it already holds as an in-place overwrite, and an unknown id as an insert by `startMs`. A rewrite that removes a selected word keeps the selection on whichever word now covers that moment. If the rewrite touches rows the UI has not loaded and it cannot place them, it reloads the transcript.
  - **Correction spanning segments (undefined).** The mock puts all the text in the first segment and removes the rest of the range. The backend should confirm or define this.
  - **Live pause markers (missing).** The requirements say the transcript records the paused span. `TimelineGap` only reaches the UI through `getMeeting`, so the live view shows no pause marker.
  - **Playback during a live recording (undefined).** Click-to-play calls `seekAudio` on the recording meeting. Confirm the backend can play audio that is still being written.
- [ ] Screens or backend areas affected: Live, and app core transcript, session and device events.
- [ ] How to test it: `npm run dev`, then use Ctrl+Shift+Alt+D, group Live.
