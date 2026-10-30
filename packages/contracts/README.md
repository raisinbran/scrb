# Contracts

**DRAFT: awaiting owner approval.** The typed UI/backend contract: `src/backend.ts` for calls and events, `src/types.ts` for shared data. Only the owner approves changes.

Calls and events go through `Backend.call` and `Backend.on`. Failures reject with `ContractError`, whose `code` survives IPC.

## Additions for owner review

These are not in the UI Specification's contract table. Each is tagged `@addition` in the source.

| Item                                                        | Why it is needed                                                                                             |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `getRecordingState`                                         | The UI must catch up after a reload; events alone cannot say what is already running                         |
| `pickAudioFile`                                             | A sandboxed renderer cannot open a file dialog. Returns an opaque token, so the renderer never passes a path |
| `getTranscript`                                             | Paged loading for stored transcripts; `transcriptChanged` only carries changes                               |
| `pauseAudio`, `playbackPosition`                            | Playback needs a stop and a position to highlight                                                            |
| `listProfiles`                                              | The Speakers screen has nothing to show without it                                                           |
| `splitSpeaker`                                              | V1 Requirements list split; the table does not                                                               |
| `answerSpeakerSuggestion`                                   | `speakerSuggestion` has no way to confirm or reject                                                          |
| `getSummary`, `getMeeting`                                  | Meeting detail and the Summary tab must load stored data                                                     |
| `updateMeeting`                                             | Import requires the meeting date to be editable                                                              |
| `pickStorageLocation`                                       | Settings needs a native folder dialog                                                                        |
| `installModelUpdate`                                        | `checkModelUpdates` finds updates but nothing could install one                                              |
| `getSetupStatus`, `startModelDownload`, `requestPermission` | The First launch screen                                                                                      |

## Decisions for owner review

1. Words carry only the display text, with the correction already applied, so the UI cannot decide precedence. The model's original text is not exposed; the "show corrections" export option is backend-side.
2. Failures of summaries travel in `summaryProgress` (stage `failed`) and of exports in `exportFinished` (`ok: false`), instead of adding `summaryFailed` and `exportFailed` events.
3. `SpeakerTarget` and `SpeakerMerge` cover both meeting speakers and voice profiles under one call.
4. Times are milliseconds on the meeting timeline. The capture draft's nanosecond timeline stays backend-side.
5. Action-item status is `open`, `done` or `unconfirmed`; the requirements name the column but not its values.
6. Transcription quality is `fast`, `balanced` or `accurate`; the requirements do not name the levels.

## Known gaps

- Mic test and meters before Start: there is no call to run meters while idle. Depends on capture draft Q8.
- Chunk metadata and adapter events (capture draft Q14) are not here.
- Requests are not validated at runtime in the main process yet. Add this with the first real handlers.
