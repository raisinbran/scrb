# Remaining cloud-ok work for ChatGPT (2026-10-31)

Every remaining V1 task that needs no owner computer, from the state of `main` on 2026-10-31. Rules and return path are in `2026-10-30-chatgpt-split.md`; they all apply here. Tasks 9 to 13 in that file come first, then these, one at a time.

**Gates:** the owner made a one-time exception so this list could be written ahead of the gates. It does not start any phase. A task runs only when the owner names its number. A diff for a phase whose earlier gate has not passed stays on its own branch and does not reach `main` until that gate is approved.

**Checked before writing:** of the 51 calls in `CALL_TABLE`, 16 reach real handlers in `apps/desktop/src/main/` or the settings handlers. `getSummary` returns an empty summary and `deleteMeeting` returns `notImplemented`. The rest fall back to `notImplemented`. Packages for live and final transcription, import, speakers, summary and export exist, but only the final pass reaches the app. Check this against the code before relying on it.

## Tasks

**Type:** Plan = a file in `docs/plans/`, for owner approval, before any code. Diff = a unified diff with tests. Contract = needs the owner's approval of the exact TypeScript first. Native = patch that cannot be built in the cloud, kept on its own branch.

### Phase 2, Gate 2

| #   | Task                                                                                                                                                                                                          | Type                            | Done when                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| 14  | Compare T1, T2, T3, T3b, T8, T13, T14 and T21 in `capture-contract-and-clock.md` with existing tests, and add those missing. Use an invented flag log for T21 if the 300 s log is not in the repo, and say so | Diff                            | A table of each case and its test                                                                |
| 15  | Mic test: `startAudioCheck`, `stopAudioCheck`, `audioCheck`, per the addition to `capture-contract-and-clock.md`, covering T22's logic                                                                        | Plan, then Diff and Native      | Writes nothing, creates no meeting, yields to Start. Mac and Windows helper patches listed apart |
| 16  | `selectSources` during a recording: reject with `conflict` if the meeting app cannot change, per the Live gaps note. Also `pickStorageLocation`, including what happens to meetings at the old location       | Diff, Plan for the storage move | Tests for both                                                                                   |

### Phase 3, Gate 3

| #   | Task                                                                                                                                                                                                                                    | Type                       | Done when                                                               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| 17  | Live transcription in the app: a worker process and bounded queue, `transcriptChanged`, `transcriptionLag`, and the separate live feed from owner decision 2. A stalled or dead worker must never touch recording                       | Plan, then Diff and Native | Plan names each failure and its test. Fixture-based tests only          |
| 18  | Import in the app: `pickAudioFile`, `importAudioFile`, `cancelImport` and the import events. A recording stops an import (owner decision 4). Cancel or failure leaves nothing. WAV, MP3, M4A, FLAC, Opus. Confirm the decoder's license | Diff                       | Tests for cancel, failure and a recording starting during import        |
| 19  | Playback: `seekAudio`, `pauseAudio`, `playbackPosition`, including gaps and a meeting still being written                                                                                                                               | Plan, then Diff            | Plan states how chunks reach the UI without weakening Electron security |
| 20  | Transcript view at 8 hours: invented data, virtualized rendering if needed, and a timing test with a stated limit                                                                                                                       | Diff                       | UI only                                                                 |

### Phase 4, Gate 4

| #   | Task                                                                                                                                                                                           | Type                                   | Done when                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| 21  | Speaker handlers: `listProfiles`, `renameSpeaker`, `mergeSpeakers`, `splitSpeaker` at the selected words, `deleteProfile`, `answerSpeakerSuggestion`, `speakerSuggestion`. Auto-name line 0.60 | Diff, Contract for pending suggestions | Every assignment can be undone. Imports change no profile unless turned on |
| 22  | Privacy: location rule in the backend, jurisdictions as an editable file, OS country, banner on each new recording and on imports                                                              | Diff, Contract for the list            | Tests per rule. No legal claims beyond the Requirements                    |

### Phases 5 and 6, Gates 5 and 6

| #   | Task                                                                                                                                                                                                                                      | Type                                   | Done when                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| 23  | Corrections: every slice of `transcript-layers-and-frozen-spans.md` not done in task 10, including `applyCorrection`, `reassignSpeaker`, `undo`, `redo`, a correction spanning segments, and `replace` meaning                            | Diff                                   | Corrections survive restarts and final passes in tests |
| 24  | Vocabulary, items 4 to 6 of the plan: bounded hints, no blind replacements, `listTerms`, `updateTerm`, `deleteTerm`. Automatic substitutions stay off                                                                                     | Diff, Contract for vocabulary undo     | Failure tests from the plan                            |
| 25  | Summary in the app: `generateSummary`, `updateSummaryItem`, `summaryProgress`, `summaryOutdated`, real `getSummary`, one large model at a time. Fix the `upgradeDecision` bug in `2026-10-30-export-summary-gaps.md` with an upgrade test | Diff, Contract for item add and remove | A fake model in tests. Format v4 stays deferred        |

### Phase 7, Gate 7

| #   | Task                                                                                                                                                            | Type                          | Done when                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------- |
| 26  | Index upgrades, Slice B                                                                                                                                         | Diff                          | Failure tests from the plan                                           |
| 27  | Delete, remaining rules: audio-only delete, the auto-delete schedule and restart recovery                                                                       | Diff                          | Nothing remains, or the failure is reported. Includes index snapshots |
| 28  | `exportMeeting`, `exportFinished`, and `needsReview` and `alsoAtMs` in `packages/export`. The decision `impactInferred` stopgap stays, since it needs format v4 | Diff                          | DOCX and PDF content match in a test                                  |
| 29  | `searchMeetings` with a filter, the date rule from the Recordings gaps note, `openMeetingFolder`, `openLogsFolder`                                              | Diff, Contract for the filter | Tests. Open only paths the app owns                                   |

### Phase 8, Gate 8

| #   | Task                                                                                                                                                                                       | Type                  | Done when                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------- |
| 30  | Packaging: bundler config for Windows and Mac, pinned, shipping helpers, tools and sidecars. Mac uses one stable self-signed certificate. Remove the `isPackaged` opt-outs in `backend.ts` | Plan, then Diff       | Build steps listed for Claude Code to run                                         |
| 31  | First launch: `getSetupStatus`, `startModelDownload` with checksums, `requestPermission`, setup screen, offline after setup                                                                | Plan, then Diff       | Tests with a local fake server. Model URLs and checksums for the owner to confirm |
| 32  | Model updates: `checkModelUpdates`, `installModelUpdate`, `revertModel`. Trial and profile rebuild stay deferred                                                                           | Diff                  | Revert test                                                                       |
| 33  | About: `getAppInfo`, `getLicenses`, third-party notices checked against every dependency and model                                                                                         | Diff                  | Notices cover the lockfile                                                        |
| 34  | User Manual draft matching the Help screen and Requirements. Screenshots left as marked placeholders                                                                                       | Plan-style doc        | Every V1 feature covered                                                          |
| 35  | Accessibility review of the UI code and tests against the Requirements                                                                                                                     | Diff                  | Findings fixed or listed                                                          |
| 36  | Security and privacy review of the code: IPC allowlists, logs hold no transcript text, no network use after setup                                                                          | Report, fixes as Diff | Findings ranked. Security fixes need a plan first                                 |

## Stays here

These need a real machine or the owner, so they are not above: every hands-on capture test (T15, T18, T19, T20, T23, T24, USB mic), real timing and memory targets, AMI accuracy runs needing models and GPU, any native build, installers on real machines, and the owner's own evaluation meetings, which never go to ChatGPT.

## Prompt

```text
You are working on Meeting Scribe, a local desktop meeting recorder, in the public GitHub repo
raisinbran/scrb, branch main. Read CLAUDE.md, docs/handoffs/2026-10-30-chatgpt-split.md and
docs/handoffs/2026-10-31-chatgpt-remaining-work.md, and follow the rules under "What ChatGPT must
follow".

Your task is number <N> in the remaining-work file, or in the split file for 9 to 13. Respect its
Type: return a plan before code where it says Plan, and propose exact TypeScript without changing
packages/contracts/ where it says Contract.

First tell me whether you can read the repo. If you cannot, stop and ask me to paste the files you
need. Do not guess at code you have not read. Name the main commit you worked from, and list
anything you did not run or check.
```
