# Gate 3 Windows: memory and worker-kill check, 2026-11-15 (Regiurn): NOT RUN, blocked at setup

**Update (owner chose BCHEN-W10 for the run):** the sampler, kill trigger and verifier are now in `scripts/gate3-retest/memory-worker-kill.mjs`, tested only against invented stand-in processes on Regiurn, with the W10 steps in `gate-3-windows-memory-worker-kill-runbook-20261115.md` (draft; needs the owner's approval of its about 25-minute total before it starts). Still no measurement and no gate claim; the run has not happened.

**Result: INCONCLUSIVE (not run). No Gate 3 pass or fail is claimed, and no measurement was taken.** The owner approved one live two-track run of about 25 minutes (stop at 125%) to cover criteria 2 and 4 of `docs/handoffs/windows-gate3-remaining-20261115.md` (on draft PR #275's branch): whole-app memory against the plan's target of about 6 GB or less, and a kill of the live transcription worker during audible capture on both tracks. Setup checks on Regiurn found that the route used by the earlier scored runs is not there, so nothing was started. About 5 minutes of the approved time were spent (machine clock 00:01 to about 00:05) on reading and these checks. No app, recording, playback, model download, driver install or administrator step ran, and nothing was repeated.

## What was checked on Regiurn (read-only)

| Needed | Finding | How checked |
| --- | --- | --- |
| The cable route of the earlier scored runs: playback into `CABLE Input`, microphone set to `CABLE Output (VB-Audio Virtual Cable)` (`gate-3-windows-scored-run-runbook-20261110.md`, steps 6, 9, 11) | **Absent.** The only audio devices are Realtek, two USB Audio Devices, NVIDIA HD Audio and NVIDIA Virtual Audio, Steam Streaming Microphone and Speakers, and DroidCam Virtual Audio. No VB-Audio entry. | `Win32_SoundDevice` list, and a search of `Win32_PnPEntity` names for `CABLE`, `VB-Audio` and `Virtual` |
| The scored-run tooling | **Written for BCHEN-W10.** The runbook and `scripts/gate3-retest/run-scored-run.ps1` use `C:\Users\bchen\...` paths, a pinned candidate build, the bundled Python 3.13 and the evidence folder `gate3-v3-preflight-20261108\`. None exists on Regiurn (`C:\Users\bchen` is absent). The runbook is a DRAFT whose own steps say a scored run needs separate written authorization. | file listing |
| Invented source audio (`renders-units-20261109-r3-derived-1\assembly\microphone.wav` and `meeting.wav`, pinned by SHA-256 in the runbook) | **Not on Regiurn.** They live in the W10 evidence folder, outside Git. AMI audio would need to be fetched or rendered. | not found under the repo or `C:\Users\brand`; a broader search was not completed |
| Native capture helper | **Not built on Regiurn.** `native/windows-capture/build/bin/scrb-capture.exe` does not exist in either checkout (`overnight-win.ps1` says to build with `build.cmd`). | file listing |
| Live transcription assets | **Present** under `C:\Users\brand\scrb-dev-assets`: `ggml-small.en-q5_1.bin`, the Silero VAD model, `whisper-server.exe`, and `config\live.json` pointing at them (CPU, `useGpu: false`). | file listing |
| A recorder with live transcription that can be driven without a person | **None found.** `scripts/long-run/overnight.mjs` records two tracks through the real helper but is "recorder only, no transcription" and has no worker to kill. The scored-run orchestrator drives the packaged candidate app through its GUI. | read of `overnight.mjs` and `overnight-win.ps1` |

## What would be needed to do the run

Each item below is a decision or an action that was not authorized or not possible inside the approved run:

1. **A route for the two tracks.** Either install VB-Audio Virtual Cable on Regiurn (a driver install that needs administrator and changes system audio settings), or run on BCHEN-W10, where the cable, the evidence folder and the pinned source audio already exist. Regiurn's physical USB inputs would need an acoustic loop, which the earlier runs did not use and which is not equivalent.
2. **Source audio** on whichever machine runs: the invented r3 WAVs by their pinned hashes, or AMI clips.
3. **The app and its live worker.** A built native capture helper (`build.cmd`) and an app launch with `live.json` for Regiurn, or the packaged candidate on W10.
4. **A sampler and a kill step** (new, not in the repo as one tool): whole-app working-set sampling of every Scribe process (main, renderer, helper, live worker) every few seconds, and one kill of the live worker while both tracks are audibly playing, followed by comparing chunk hashes before and after, checking continuity and gaps, and confirming status `ready` and that the worker restarts or the app says so. The pass conditions are the ones in `windows-gate3-remaining-20261115.md` rows 2 and 4 and in the Gate 3 text of the Development Plan.
5. **Approval of the total time.** The 25 minutes in the approval cannot cover items 1 to 3 plus the run. A fresh estimate is needed before any new attempt.

## Status of the two criteria

- Criterion 2 (memory, about 6 GB or less, recording plus live): **still open.** The only Windows figure in the repo remains 1,973 MiB from a final pass, not recording plus live, and not a true peak (`gate-3-windows-final-recovery-20261103.md:27`). macOS passed at 937 MiB.
- Criterion 4 (worker kill during audible capture): **still open.** No Windows record of this check on the final build exists.

## Not done, on purpose

No rerun was attempted. Nothing was installed or downloaded, no administrator step was used, no audio was played or recorded, and no private recording or owner data was touched. A mistake of mine here: one recursive file search over the whole home folder was started, ran past its time limit and was stopped, so the "not found" for the source audio is from targeted checks only. This is logged as incident A-409 (a time-wasting call, no other effect).

## Owner decision needed

Which route: (a) run on BCHEN-W10 with the existing cable and pinned audio, with a sampler and kill step written and reviewed first; (b) install the cable on Regiurn and build the helper, with the time and administrator step approved; or (c) accept Gate 3 criteria 2 and 4 on the earlier Mac evidence plus a smaller Windows check. No option is recommended here because each changes what the evidence means.
