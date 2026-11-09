# Gate 3 Windows: D2 practice run checklist (DRAFT)

**Status:** DRAFT, not owner-approved to run. **This is a practice run: it is not scored and it freezes nothing.** It validates the D2 route (microphone track through VB-CABLE, system track through endpoint loopback) on the real Live screen, so that the scored retest does not discover route problems.

Planned total: **about 17 minutes, under the 20-minute limit** (setup, 420 s of recording, processing). If any step runs materially long, stop and tell me before repeating anything. Do not rerun a failed or inconclusive practice automatically.

Test data only: the r3 assembled WAVs (AMI-derived constructed units). Nothing of the owner's real meetings is used.

## Budget

| Block | Minutes |
| --- | --- |
| Setup (steps 1 to 6) | 5 |
| Recording (steps 7 to 10): 420 s of audio, plus about 10 s lead-in and 20 s tail | 8 |
| Stop, save, copy back (steps 11 to 13) | 2 |
| My analysis (read-only, after copy-back) | 2 of owner time, none needed |
| Total owner time | about 15 to 17 |

## Files used (all outside Git)

| What | Path | SHA-256 of raw bytes |
| --- | --- | --- |
| Playback script | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2\play-sources.ps1` | `96465f109b97fd1a8a3d08d62c05ab3b69a9091c57eb50c8537454c908e5133f` |
| Endpoint listing script | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2\list-audio-endpoints.ps1` | `90f022ebc6e7a0199574ed1b4e8b51c5bf3020a650b8a5ef9c4edd5fb5da6094` |
| Microphone source | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav` | `1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4` |
| Meeting source | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav` | `3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7` |
| Recording-ready file (you create it in step 8) | `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\recording-ready.txt` | n/a |

All commands are Windows PowerShell 5.1, **not Administrator**. The `-ExecutionPolicy Bypass` applies to that one process only and changes no Windows setting.

## Steps (T is minutes from your start; no admin anywhere)

**Window A and Window B:** open two ordinary PowerShell windows now. A runs the playback script. B holds the ready-file command.

1. **T+0 Settings.** Apply the D2 draft section 5 settings (default playback = the Realtek output with headphones plugged in; Listen to this device off; desktop apps may use the microphone; notification sounds silenced; volume as that section states). Wear the headphones. Do not play anything aloud in the room.
2. **T+2 Endpoint listing.** In Window A run this, then paste its content to me (no screenshots):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2\list-audio-endpoints.ps1' -OutFile 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\endpoints-before.txt'
   ```

   If the `practice-d2` folder does not exist yet, first run `New-Item -ItemType Directory -Force -Path 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2' | Out-Null`.
3. **T+3 Open the candidate** (the 553dd90 build) to the Live screen. In its microphone chooser select **CABLE Output (VB-Audio Virtual Cable)**. Leave system audio on "whole computer". The Test mic meter may not reflect the real route (November 7 finding), so do not trust it either way.
4. **T+4 Dry run** in Window A (plays nothing and creates no folder). It must show the microphone WAV going to `CABLE Input`, the system WAV going to the Realtek output, a format query of `rc=0` for both, and end with `Dry run complete. Nothing was played`. If it says the default playback is a CABLE device, stop and tell me. It prints `OWNER-CONFIRM` because it cannot read the app's microphone setting; step 3 is your confirmation:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2\play-sources.ps1' -MicrophoneWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav' -MeetingWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav' -ExpectedMicrophoneSha256 '1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4' -ExpectedMeetingSha256 '3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7' -OutFolder 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\playback-log-real'
   ```

   The dry run uses the same `-OutFolder` as the real run because it creates nothing.

5. **T+5 Type the ready-file command in Window B, but do not press Enter yet:**

   ```powershell
   $d='C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Set-Content -LiteralPath "$d\recording-ready.txt" -Value ([DateTime]::UtcNow.ToString('o')) -Encoding ASCII
   ```

6. **T+6 Start the real run in Window A.** It checks everything, then waits up to 120 s for the ready file. This is the dry-run command with `-Play -OwnerApprovedLongTest` added. Press Enter, then go straight to step 7:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\tools-d2\play-sources.ps1' -MicrophoneWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav' -MeetingWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav' -ExpectedMicrophoneSha256 '1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4' -ExpectedMeetingSha256 '3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7' -OutFolder 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\playback-log-real' -Play -OwnerApprovedLongTest
   ```

   (`-OwnerApprovedLongTest` here records your approval of this 420 s practice run, which is planned under 20 minutes.) If the dry run named the system device `Speakers (2- Realtek(R) Audio)`, the script refuses to play unless you add ` -HeadphonesWorn`. Add it only if you are really wearing headphones plugged into that Realtek output, so nothing sounds aloud in the room. Otherwise stop.
7. **T+7 Press Record** in the app.
8. **Within 5 seconds of pressing Record, press Enter in Window B** (the ready-file command). The script starts playback about a second later. If it reports the ready file was too late, it aborts before any sound: stop the recording, tell me, and do not repeat without asking.
9. **T+7 to T+14 Wait.** About 420 s plays. Watch only that the Live screen shows text for both tracks; change nothing.
10. **When Window A prints that playback finished,** wait about 20 seconds.
11. **T+14.5 Press Stop** in the app and wait for it to finish saving.
12. **T+15 Save the recordings.** Do not delete or move anything. Note the session folder the app reports.
13. **T+16 Copy back to me:** (a) the text printed in Window A for steps 4 and 6; (b) the content of `endpoints-before.txt`; (c) the app's session folder path; (d) the time on the clock when you pressed Record and when you pressed Enter in Window B, if you noticed (write "not noted" otherwise); (e) anything that looked odd.

## What I do afterwards (read-only, no playback, no changes to your files)

1. Read the two saved tracks and find both marker sets: 880 Hz (microphone) and 1320 Hz (meeting) at 1.0, 1.5, 2.0 s and at 381.0, 381.5, 382.0 s of source time.
2. Fit offset and drift between each track's marker times and the playback log (Stopwatch ticks and UTC), and report the residuals.
3. Check both tracks are non-silent for the whole 420 s.
4. Compare format and gain of the two tracks against the endpoint listing, and against what the November 7 acoustic route produced.
5. Check there is no bleed: no 1320 Hz marker on the microphone track and no 880 Hz marker on the meeting track.
6. Report PASS or FAIL per check, with numbers. This outcome is not a gate result and changes no acceptance threshold.

## Not part of this practice run

No freeze, no scoring, no merge, no change to thresholds, no deletion of any evidence. A route problem found here is recorded as a finding for the D2 draft, not hidden.
