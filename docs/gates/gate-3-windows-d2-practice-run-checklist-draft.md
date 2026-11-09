# Gate 3 Windows: D2 practice run checklist (DRAFT)

**Status:** DRAFT, not approved to run. **This is a practice run: it is not scored and it freezes nothing.** It validates the D2 route (microphone track through VB-CABLE, system track through endpoint loopback on the Realtek speakers) on the real Live screen, so the scored retest does not discover route problems.

**Needs the owner's explicit advance approval before it starts.** The planned fixed steps total about 17 minutes, but the app's final processing after Stop and the cleanup are not measured (see "Duration"), so the complete practice cannot be shown to stay under 20 minutes. I have not assumed approval. Approval line for the owner: `Practice run approved by the owner in chat on ____ (time not recorded unless noted)`.

Test data only: the r3 assembled WAVs (AMI-derived constructed units). Nothing of the owner's real meetings is used. Do not rerun a failed or inconclusive practice automatically.

## Duration (recalculated 2026-11-09)

| Block | Minutes | Basis |
| --- | --- | --- |
| Setup: settings and volume (2), endpoint listing (1), app check and launch (1), microphone selection (1), dry run (1) | 6 | estimate |
| Recording: 420 s of audio, about 10 s lead-in, about 20 s tail | 7.5 | 420 s fixed by the sources |
| Stop, wait for save, copy back | 3 | estimate |
| **Fixed subtotal (owner time)** | **about 16.5** | |
| Final processing after Stop (app's final pass) | **not measured** | The November 7 evidence I read does not record the final pass duration for its 286 s recording. Final processing IS NOT included in the subtotal. |
| Cleanup (close the app after the final pass ends) | **not measured** | |
| My read-only analysis | not owner time | runs after copy-back |

Because final processing and cleanup are unmeasured, the complete practice may exceed 20 minutes. Options for the owner: approve the full practice including final processing, or approve stopping the wait after copy-back and closing the app later (the analysis does not need the final transcript).

## What was built (2026-11-09, for the freeze manifest)

Candidate: commit `553dd9080f452f8a54ccff5cd5fea8d6937438ae` (PR 67 diagnostics head), new clean checkout `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\candidate-553dd90`, `git status --porcelain` empty, dependencies by `npm ci` (exit 0), no source, lockfile or dependency edits, no patches. The older `candidate` folder (no Git metadata, failed build) is untouched and unused. Earlier failure cause: the esbuild step was run from the wrong working directory (the shared checkout) under a restricted shell, so it could not read a parent directory or resolve `./src/main/main.ts`. It was not a missing toolchain.

Toolchain: Node v26.13.0, npm 11.20.0, Electron 45.1.0, MSVC cl 19.44.35229 (x64), CMake 3.31.6, Windows SDK 10.0.26100.0, libopus 251d657e92fccfa3b05baec4f05756cce252fb75 (fetched and built by the candidate's own `fetch-opus.ps1`).

| Artifact (under candidate-553dd90) | SHA-256 of raw bytes |
| --- | --- |
| `apps\desktop\dist-electron\main.cjs` | `b9ae7eaea0eaab9fba17b347ea5f7802a94c95cffcc8dcfe06b65378692214e3` |
| `apps\desktop\dist-electron\preload.cjs` | `b6d1f56197c977f79b9ac9fbcc09996285ed66f7c4808073d316dc295b600df8` |
| `apps\desktop\dist-electron\liveWorkerEntry.mjs` | `87b56e33de7160d710edb355317bdc07ecc32cb2dd68de7990d59d95727d778c` |
| `apps\desktop\dist\index.html` | `2b74977df596389966dbb97f90bdeb8f728ab24bf84027607f7c9eac8bc9c3d8` |
| `native\windows-capture\build\bin\scrb-capture.exe` (capture helper) | `4c49811a3d2a3a3cb08b457113daa0fe2c72d23a18b5dff2157279f32823e292` |
| `node_modules\electron\dist\electron.exe` (app executable) | `c579acaab64b1c456bda1693cdf1a2ec7e4de7738b0e2d1b6349d60e8087143c` |
| `live-config.json` and `final-config.json` in `gate3-reference-e85-20261103` (same bytes) | `ac4c719def84647f3b857c346507041f7995a144713da96ea17464c6020531e0` |

Build logs (outside Git): `gate3-v3-preflight-20261108\build-logs-553dd90\` (`01-npm-ci.log`, `02-app-build.log`, `03-native-build.log` and `03b-native-build.log` failed attempts of the unedited `fetch-opus.ps1` under Windows PowerShell 5.1, `03c-native-build-pwsh.log` the successful run of the same unedited script under PowerShell 7). Environment note: the helper build needed PowerShell 7 (`pwsh`) for the candidate's unedited `fetch-opus.ps1`; under Windows PowerShell 5.1 its `git ... 2>$null` line stops the script. No candidate file was edited.

### How the app finds the helper (checked in `apps/desktop/src/main/backend.ts:56-69`)

The helper path comes only from the environment variable `SCRB_CAPTURE_HELPER`; without it the app answers with a mock and records nothing real. `SCRB_LIVE_CONFIG` enables live transcription and `SCRB_FINAL_PASS_CONFIG` the final pass. `launch-candidate.ps1` sets all three, to the hashed helper and the retained November 7 configuration files (hash above), and re-checks every hash immediately before launching. It calls `electron.exe` directly. It does not call `npm`, `vite`, `esbuild` or any build step (a unit test enforces that), because the desktop package's `npm start` rebuilds first and must not be used. The script ran in check-only mode here (commit, clean tree, all hashes passed). **I have not launched the app.**

## Files used (all outside Git)

Use only the `tools-d2-v2` folder. The older `tools-d2` folder is superseded and must not be used (its `play-sources.ps1` still has the withdrawn headphone and speaker flags).

| What | Path | SHA-256 of raw bytes |
| --- | --- | --- |
| Playback script | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\play-sources.ps1` | `5b2da634adc613c9e960b4a06b668a334344a6cfd6251007123ca49f37fda366` |
| Endpoint listing script | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\list-audio-endpoints.ps1` | `90f022ebc6e7a0199574ed1b4e8b51c5bf3020a650b8a5ef9c4edd5fb5da6094` |
| App launch script | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\launch-candidate.ps1` | `f9f4648707e7cb4b4a861890e243924342dc7630aaa16f1fd04b80678e1bdfbb` |
| Microphone source | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav` | `1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4` |
| Meeting source | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav` | `3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7` |
| Recording-ready file (you create it in step 9) | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\recording-ready.txt` | n/a |

All commands are Windows PowerShell 5.1, **not Administrator**. `-ExecutionPolicy Bypass` applies to that one process only and changes no Windows setting.

## Steps (T is minutes from your start; no admin anywhere)

Open two ordinary PowerShell windows. **A** runs scripts. **B** holds the ready-file command.

1. **T+0 Windows settings.** Apply the D2 draft section 5 settings. The ones that matter most: the default playback device must be **`Speakers (2- Realtek(R) Audio)`**. On 2026-11-09 07:44 UTC your default was `Headphones (No Air 3)` (Bluetooth); change it first. The playback script refuses anything that is not a Realtek output (CABLE devices, Bluetooth, USB, HDMI and so on). The default recording device is already `CABLE Output`.
2. **T+1 Speaker volume.** Set the speaker volume **low but audible** and **write down the setting** (for example "22 of 100"). The same setting must be used in the real retest. One run measures the captured level at this setting; it cannot prove how changing the Windows speaker volume affects the recording. After the run I report the measured system-track level.
3. **T+2 Endpoint listing.** In Window A:

   ```powershell
   New-Item -ItemType Directory -Force -Path 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2' | Out-Null; powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\list-audio-endpoints.ps1' -OutFile 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\endpoints-practice.txt'
   ```

   Paste me the file content when done (no screenshots).
4. **T+3 App check (launches nothing).** In Window A:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\launch-candidate.ps1'
   ```

   It must print `commit OK: 553dd9080f452f8a54ccff5cd5fea8d6937438ae, tree clean`, eight `hash OK` lines and `Check-only run complete`. That is how you confirm the app is the pinned commit and the hashed helper. Any other output: stop and paste it to me.
5. **T+4 Launch.** In Window A (`practice-d2\app-run` must not exist yet; the script makes a fresh profile and library there):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\launch-candidate.ps1' -Launch
   ```

   Expect a window titled **Meeting Scribe** within a few seconds and a final line `Launched Electron PID ...`. Open the **Live** (recording) screen.
6. **T+5 Microphone.** In the app's microphone chooser select **CABLE Output (VB-Audio Virtual Cable)**. Leave system audio on "whole computer". The Test mic meter may not reflect the real route (November 7 finding), so do not trust it either way.
7. **T+6 Dry run** in Window A (plays nothing, creates no folder). It must show the microphone WAV going to `CABLE Input`, the system WAV going to `Speakers (2- Realtek(R) Audio)`, a format query of `rc=0` for both, and end with `Dry run complete. Nothing was played`. It prints `OWNER-CONFIRM` because it cannot read the app's microphone setting; step 6 is your confirmation. Any refusal (for example a non-Realtek default): stop and paste it.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2-v2\play-sources.ps1' -MicrophoneWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav' -MeetingWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav' -ExpectedMicrophoneSha256 '1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4' -ExpectedMeetingSha256 '3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7' -OutFolder 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\playback-log-real'
   ```

8. **T+7 Type the ready-file command in Window B, but do not press Enter yet:**

   ```powershell
   $d='C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Set-Content -LiteralPath "$d\recording-ready.txt" -Value ([DateTime]::UtcNow.ToString('o')) -Encoding ASCII
   ```

9. **T+8 Start the real run in Window A.** It is the step 7 command with ` -Play -OwnerApprovedLongTest` added at the end. It checks everything, then waits up to 120 s for the ready file. Press Enter, then go straight to the next step. Then: **press Record** in the app, and **within 5 seconds press Enter in Window B**. The script starts playback about a second later. If it reports the ready file was too late, it aborts before any sound: stop the recording, tell me, and do not repeat without asking. The speaker sound is audible in the room (owner decision).
10. **About 7.5 minutes: wait.** About 420 s plays. Watch only that the Live screen shows text for both tracks; change nothing.
11. **When Window A prints that playback finished,** wait about 20 seconds, then press **Stop** in the app and wait for it to finish saving.
12. **Save the recordings.** Do not delete or move anything. Note the session folder (it is under `practice-d2\app-run\library`). Do not close the app until the final pass has finished unless you have approved stopping the wait (see "Duration").
13. **Copy back to me:** (a) the text printed in Window A for steps 3, 4, 5, 7 and 9; (b) the content of `endpoints-practice.txt`; (c) the speaker volume setting you wrote down; (d) clock times when you pressed Record and Enter in Window B, if you noticed ("not noted" otherwise); (e) anything that looked odd.

## What I do afterwards (read-only, no playback, no changes to your files)

1. Read the two saved tracks and find both marker sets: 880 Hz (microphone) and 1320 Hz (meeting) at 1.0, 1.5, 2.0 s and at 381.0, 381.5, 382.0 s of source time.
2. Fit offset and drift between each track's marker times and the playback log (Stopwatch ticks and UTC), and report the residuals.
3. Check both tracks are non-silent for the whole 420 s.
4. Compare format and gain of the two tracks against the endpoint listing and the November 7 acoustic route, and report the **measured system-track level** at your speaker volume setting.
5. Check there is no bleed: no 1320 Hz marker on the microphone track and no 880 Hz marker on the meeting track.
6. Report PASS or FAIL per check, with numbers. This is not a gate result and changes no acceptance threshold.

## Not part of this practice run

No freeze, no scoring, no merge, no change to thresholds, no deletion of any evidence. A route problem found here is recorded as a finding for the D2 draft, not hidden.
