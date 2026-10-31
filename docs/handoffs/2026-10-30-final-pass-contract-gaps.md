# Final pass: contract gaps

- [ ] From backend to owner and UI.
- [ ] Needed: a way to show that a meeting's final pass failed, and a way to retry it. The contract's `MeetingStatus` has no failed value and `MeetingDetail` has no failure message. Until then a failed meeting (`transcriptionFailed` in storage) reports `ready`, and `getTranscript` throws `internal` with the plain-language reason, which the Transcript tab shows. The list shows no failure mark. Progress during the pass is also not reported: the UI only has the `finalPassRunning` status, which it polls.
- [ ] Contract items affected: `MeetingStatus`, `MeetingDetail`, a new retry call, optionally a final-pass progress event.
- [ ] Areas affected: Recordings list and meeting detail; `apps/desktop/src/main/meetings.ts` (`toContractStatus`).
- [ ] How to test it: set `SCRB_CAPTURE_HELPER` and `SCRB_FINAL_PASS_CONFIG` to a file with a missing tool path, record, Stop, then open the meeting.

`SCRB_FINAL_PASS_CONFIG` names a JSON file: `{ "tools": { "ffmpeg", "whisperCli", "sherpaSidecar" }, "models": { "speechFinal", "vad", "segmentation", "embedding" } }`, all absolute paths. Packaged builds ignore it.
