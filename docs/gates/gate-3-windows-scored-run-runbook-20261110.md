# Gate 3 Windows: scored-run runbook for the owner (DRAFT, 2026-11-10)

**Status: DRAFT. Nothing here is authorized.** This is a checklist for the day you decide to run. It does not approve the manifest, does not authorize a recording, and does not authorize a rehearsal. The scored run and the rehearsal each need your **separate written authorization before they record**, and a run expected to take more than 20 minutes needs your explicit approval before it starts (AGENTS.md). If any step fails, stop; do not retry on your own and do not ask an agent to retry without your say-so.

All commands are **Windows PowerShell 5.1** (`powershell.exe`, not `pwsh`), **not Administrator** (answer "no" to every "run as administrator" question). `-ExecutionPolicy Bypass` applies to that one process only. Paste one command at a time. Open two windows: **Window A** runs the commands; **Window B** stays free for the Snipping Tool and the app.

## Values you need before you start

Three values come from the owner approval sheet (`gate-3-windows-owner-approval-sheet-20261109.md`), after you have approved the manifest in writing. Write them on paper; the commands below show them as `<PIN>`, `<APPROVED_SHA256>`.

| Name | What it is | Where it comes from |
| --- | --- | --- |
| `<PIN>` | the pinned commit (40 characters) | approval sheet, "documents pinned at" |
| `<APPROVED_SHA256>` | SHA-256 of the approved manifest (64 characters) | the value you named in your approval |
| Run name | `scored-run-1` for the scored run, `rehearsal-1` for the rehearsal | you choose; a new name for every attempt, because the folders must not exist yet |

Fixed folders (all outside Git):

- Checkout of the pin: `C:\Users\bchen\Documents\GitHub\scrb-run-pin`
- Preflight folder: `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108` (called PREFLIGHT below)
- Approved manifest copy: `PREFLIGHT\approved-manifest\windows-gate3-v3-preflight-manifest.json`
- Python used by the tests and by the run: `C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe` (3.13.0)
- Evidence of a run: `PREFLIGHT\<run name>\` (made by the orchestrator, must not exist). The app's profile and library: `PREFLIGHT\<run name>-app\` (made by the launch script, must not exist).

## Part 1: get the tools and prove they are the approved ones (about 5 minutes, nothing is recorded)

1. **T+0. Make a clean checkout of the pinned commit.** Window A, run in `C:\Users\bchen\Documents\GitHub`, administrator: no. The folder `scrb-run-pin` must not exist yet; if it does, stop and tell the agent (do not delete it).

   ```powershell
   Set-Location 'C:\Users\bchen\Documents\GitHub'; git clone --no-checkout 'C:\Users\bchen\Documents\GitHub\scrb-scoring-fixes' 'C:\Users\bchen\Documents\GitHub\scrb-run-pin'
   ```

   ```powershell
   git -C 'C:\Users\bchen\Documents\GitHub\scrb-run-pin' checkout <PIN>
   ```

   ```powershell
   git -C 'C:\Users\bchen\Documents\GitHub\scrb-run-pin' rev-parse HEAD; git -C 'C:\Users\bchen\Documents\GitHub\scrb-run-pin' status --short
   ```

   The first line printed must be exactly `<PIN>`, and nothing may follow it (an empty status means a clean tree). Anything else: stop.

2. **T+1. Put the approved manifest file in place, byte for byte.** Window A, any folder, administrator: no. `cmd /c` is used on purpose: PowerShell's own `>` would save the file in a different text encoding and change its bytes.

   ```powershell
   New-Item -ItemType Directory -Force 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest' | Out-Null; cmd /c "git -C C:\Users\bchen\Documents\GitHub\scrb-scoring-fixes show rosmont/windows-gate3-integration-2-20261109:docs/gates/windows-gate3-v3-preflight-manifest.json > C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json"
   ```

3. **T+2. Read its SHA-256 and compare it with your approved value.** Window A, any folder, administrator: no.

   ```powershell
   (Get-FileHash -Algorithm SHA256 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json').Hash.ToLower()
   ```

   It must equal `<APPROVED_SHA256>` character for character. If it differs, the branch holds a different manifest than the one you approved: stop. (The verifier hashes the file with Windows line endings turned into Unix ones, which equals the committed bytes; a manifest saved through Git with line-ending conversion therefore still gets the same value. The check in step 4 is the one that counts.)

4. **T+3. Run the verifier by hand.** Window A, folder `scrb-run-pin`, administrator: no. This is the same check the orchestrator repeats before and after capture. It takes about 15 seconds.

   ```powershell
   Set-Location 'C:\Users\bchen\Documents\GitHub\scrb-run-pin'; & 'C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe' -I '.\scripts\gate3-retest\verify-against-manifest.py' --manifest 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json' --approved-manifest-sha256 <APPROVED_SHA256> --checkout 'C:\Users\bchen\Documents\GitHub\scrb-run-pin'; "exit code: $LASTEXITCODE"
   ```

   It must end with `RESULT: PASS`, `mismatches: 0` and `exit code: 0`. Any `MISMATCH:` line: stop and paste the output to the agent.

## Part 2: set up the room, Windows and the app (about 10 minutes)

5. **T+5. Room.** The speakers play the test audio aloud for about 7 minutes. Be in the room you chose for that (aloud tests need a private room); no sound is played until Part 3.
6. **T+6. Windows playback device and volume (settings, no command).** Set the default playback device to **Speakers (2- Realtek(R) Audio)**, not Bluetooth (the playback script refuses anything that is not a Realtek output). Set the speaker volume to **10**, as in the practice run. The default recording device should be **CABLE Output**.
7. **T+8. Endpoint listing.** Window A, folder `scrb-run-pin`, administrator: no. Paste the printed file content to the agent afterwards.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\list-audio-endpoints.ps1' -OutFile 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\endpoints-<run name>.txt'
   ```

8. **T+9. Check the app build (launches nothing).** Window A, folder `scrb-run-pin`, administrator: no.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\launch-candidate.ps1'
   ```

   It must print `commit OK: 553dd9080f452f8a54ccff5cd5fea8d6937438ae, tree clean`, the `hash OK` lines and `Check-only run complete`. Anything else: stop.

9. **T+10. Dry run of the playback (plays nothing, creates no folder).** Window A, folder `scrb-run-pin`, administrator: no. It must show the microphone WAV going to `CABLE Input`, the system WAV going to `Speakers (2- Realtek(R) Audio)`, `rc=0` for both, and `Dry run complete. Nothing was played`. A refusal (for example a non-Realtek default): stop. `OWNER-CONFIRM` is printed because the script cannot read the app's microphone setting; step 11 is your confirmation. `-OutFolder` is required even for the dry run (the script throws `-OutFolder is required` without it). Give it a folder name that does not exist, for example `PREFLIGHT\<run name>-dryrun`; the dry run never creates it, and a name that already exists is refused.

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\play-sources.ps1' -OutFolder 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>-dryrun' -MicrophoneWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\microphone.wav' -MeetingWav 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3-derived-1\assembly\meeting.wav' -ExpectedMicrophoneSha256 '1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4' -ExpectedMeetingSha256 '3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7'
   ```

10. **T+11. Launch the app with a fresh profile.** Window A, folder `scrb-run-pin`, administrator: no. `PREFLIGHT\<run name>-app` must not exist; the script creates it, so the profile is fresh and the Live screen starts with no old rows (a first sample with visible words would make the run INCONCLUSIVE).

    ```powershell
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\launch-candidate.ps1' -Launch -RunFolder 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>-app'
    ```

    The last line is `Launched Electron PID <number> ...; profile <PREFLIGHT>\<run name>-app\profile`. **That number is the app PID.** Write it down. **Check the profile path in that line:** it must contain exactly the run name you will pass to the orchestrator in step 14 (`<run name>-app`), and the launch must not have stopped with `RunFolder already exists` (that error is how the script refuses an old profile; a profile cannot be proven fresh from the process command line, so this printed line is your confirmation). The orchestrator also requires the app's command line to carry `--user-data-dir=<PREFLIGHT>\<run name>-app\profile`. If you missed it, Window A, any folder, administrator: no:

    ```powershell
    Get-Process electron | Where-Object { $_.MainWindowTitle -like '*Meeting Scribe*' } | Select-Object Id, MainWindowTitle
    ```

    Exactly one row must come back; its `Id` is the PID.

11. **T+12. Choose the microphone explicitly and open the Live screen. Do this BEFORE the orchestrator is started (step 14).** In the app, open the microphone selector on the Live screen and choose the entry named exactly **`CABLE Output (VB-Audio Virtual Cable)`** (the name `list-audio-endpoints.ps1` printed in step 7). **Do not leave it on "System default".**
    - **Observable confirmation:** the closed selector must read exactly `CABLE Output (VB-Audio Virtual Cable)`. Read the text aloud to the agent (or paste it in chat) before you go on.
    - **Not accepted:** a selector that reads `System default (CABLE Output (VB-Audio Virtual Cable))` or any text beginning `System default`. That is what rehearsal-1 showed (reported by the owner); it happened to resolve to the same device, but it follows whatever Windows has as the default and is **not accepted for the scored run**. If the selector begins with `System default`, choose the explicit entry; if the explicit entry is missing, stop.
    - **Evidence:** press **Win + PrintScreen** (saves the whole screen to `C:\Users\bchen\Pictures\Screenshots` and does not open the Snipping Tool) with the selector visible, and note the file name; step 13 repeats this. Both files are copied into the evidence folder at step 17 (the evidence folder does not exist until the orchestrator creates it).

    Leave system audio on "whole computer". Open the **Live** (recording) screen and leave the window where it is: it must be on the main screen, and the lower-left area of the screen (the clock overlay appears there) must not be covered. Do not press Record: the orchestrator does.
12. **T+13. Snipping Tool.** Window B: open the Snipping Tool, switch to video recording (the camera icon) and leave it open without starting. The orchestrator presses **New recording**, drags a region that covers almost the whole main screen (so it contains the Live transcript pane and the clock overlay) and presses **Start**. Do not click anything in the Snipping Tool afterwards.
13. **T+14. Last look.** Close other apps that make sound or change the screen. Check once more: default playback device Realtek speakers, volume 10, and the app's microphone selector still reads exactly `CABLE Output (VB-Audio Virtual Cable)` (not `System default ...`). Take the second Win + PrintScreen now and tell the agent the selector text. If it reads anything else, stop and fix it before step 14.

## Part 3: the run (needs your written authorization before it records)

### Suggested `-ObserverSeconds`: 545

The observer must stay alive from its start until the end of the drain. Longer is harmless (the orchestrator stops it at the end); shorter loses data.

| Block | Seconds | Basis |
| --- | --- | --- |
| Observer start to Record: read the clock origin (about 1), start the overlay (3), start frame capture and sampler (6), playback readiness check (up to 20 allowed by the script) | 30 | validation-5 timings, rounded up |
| `-RecordSeconds` | 420 | protocol: recording_seconds |
| `-DrainSeconds` after Stop | 30 | as in validation-5 |
| Snipping Tool stop and cleanup | 3 | script waits |
| Margin | 62 | rounds the total to 545 |
| **Total** | **545** | |

### Run

14. **T+15. Start the orchestrator.** Window A, folder `scrb-run-pin`, administrator: no. Replace `<PID>` with the app PID from step 10, `<run name>` with the run name (`scored-run-1`) and `<APPROVED_SHA256>` with the approved value. All parameters are shown; none is optional except `-RecordSeconds`, `-DrainSeconds`, `-PreflightDir` and `-Python`, which are written out here so the record shows them.

    ```powershell
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\run-scored-run.ps1' -AppPid <PID> -EvidenceDir 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>' -ManifestPath 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json' -ApprovedManifestSha256 <APPROVED_SHA256> -ObserverSeconds 545 -RecordSeconds 420 -DrainSeconds 30 -PreflightDir 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108' -Python 'C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe'
    ```

15. **Hands off.** What the script does, so you know it is working: runs the verifier (about 15 s) and stops if it fails; checks that the app PID is the one pinned candidate `electron.exe` (path and SHA-256), has the run's `--user-data-dir`, and that no second candidate app is running (stops if not, before anything is captured; close any other copy of the candidate app first); presses Snipping Tool New recording and Start; starts the observer, the clock overlay, the frame capture and the resource sampler; starts the playback waiter and proves it is ready; presses **Record** in the app and waits (up to 5 s) until the app shows its **Stop** button, which exists only while recording, before it lets the playback start; plays the two sources through CABLE Input and the Realtek speakers; stops the playback at 420 s; presses **Stop** in the app; waits 30 s; stops the Snipping Tool recording; stops its helper processes; runs the verifier again. Do not touch the mouse or keyboard. There is no scripted scrolling.

    Expected duration of the orchestrator: about 9 minutes (verifier 15 s, set-up about 30 s, recording 420 s, drain 30 s, close-down 5 s, second verifier 15 s). With Part 1 and 2 (about 15 minutes) and the checks in Part 4 the whole session is **about 30 minutes**, and the app's own final processing after Stop is **not measured** and not included. **A run expected to exceed 20 minutes needs your explicit approval before it starts.**

16. **It finished well when** the window prints nothing in red, the last `run-record.txt` lines say `verifier after-capture exit code 0` and `run finished`, and `actions.log` ends with `observer, overlay, frame capture, sampler stopped`. `run-record.txt` always ends with exactly one of `run finished` or `run INVALID: <reason>`; an INVALID run is not scored. It is INVALID if the app's Stop or the Snipping Tool's Stop cannot be found at the end, the observer has exited before the end of the drain, the playback exits more than 5 s before the 420 s mark (the sources are exactly 420.0 s, so a healthy playback ends at or after the mark; the script stops it at the mark), the app PID is not the pinned candidate, or the app does not show Stop within 5 s of Record. A frame-capture or sampler helper that exits early is only logged as a `WARNING` in `actions.log` (supplementary, not a validity condition).

### If something goes wrong (an abort)

An abort looks like: red error text in Window A, a line starting `ABORT:` in `actions.log` (for example `ABORT: playback not ready`, `ABORT: verifier before-capture exit 1`), or a `verifier ... failed` message. Do this and nothing else:

- Do **not** rerun, and do not ask an agent to rerun, without your explicit decision. Do not repeat a failed or inconclusive run automatically.
- If the app is still recording, press **Stop** in the app, then Stop in the Snipping Tool. If sound is still playing, close the PowerShell window that is playing it.
- **Preserve everything**: do not delete or move the evidence folder, the app folder `<run name>-app`, the Snipping Tool video or the checkout. Evidence is kept per `docs/gates/evidence-retention-policy.md` until you pass the gate and authorize cleanup.
- Paste to the agent: the text in Window A, `<run name>\actions.log`, `<run name>\run-record.txt` and any `verifier-*.txt`. The agent logs the failure and proposes next steps; you decide.

## Part 4: after the recording (the run is not scored yet)

17. **Copy the Snipping Tool video** (copy, do not move) into the evidence folder. Window A, any folder, administrator: no. Use the newest file in the Screen Recordings folder; list it first:

    ```powershell
    Get-ChildItem 'C:\Users\bchen\Videos\Screen Recordings' | Sort-Object LastWriteTime -Descending | Select-Object -First 3 Name, Length, LastWriteTime
    ```

    ```powershell
    Copy-Item -LiteralPath 'C:\Users\bchen\Videos\Screen Recordings\<newest file name>' -Destination 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>\screen-recording.mp4'
    ```

    Also copy the two Win + PrintScreen screenshots of the microphone selector (steps 11 and 13) from `C:\Users\bchen\Pictures\Screenshots` into `<run name>\` (copy, do not move), and tell the agent their file names.

18. **First overlay-bearing frame: manual, unscored sanity check.** The pinned decoder (`ffmpeg.exe`) is audio-only, so no frame is extracted and no tool is added. You do this by eye; the agent compares. Open the copied `<run name>\screen-recording.mp4` in a Windows media player (Media Player or Movies & TV; name the one you used). Step forward from the start to the **first frame that shows the clock overlay** and report three things: (1) the **video time** of that frame, (2) the **overlay reading** on it (seconds, three decimals), and (3) whether the overlay reading has **advanced** when you look at about 10 s later in the video. **Expected, not a defect:** the video starts before the observer and the overlay (a few seconds without the overlay), and the Meeting Scribe window's own title bar is cut off, because the capture region the script drags starts 12% down the screen (`Abs 0.01 0.12` in `run-scored-run.ps1`). The agent then computes the expected first reading from `actions.log`: (overlay `started` tick minus the `origin_qpc` value) divided by the Stopwatch frequency (10,000,000 ticks per second on this PC), **plus an allowance of 0.5 s to 1.5 s** for Windows PowerShell to start, load Windows Forms and draw the first frame, and reports whether your reading falls in that range (tolerance: the range itself, widened by 0.5 s for reading the player), or states the discrepancy. This check is manual and unscored; it does not gate the run and does not change any score. A video that lacks the overlay for a stretch must be reported, not assumed.
19. **Do not close the app** until its final pass has finished (unless you decide to stop waiting), and keep every file.

## Part 5: scoring is a separate step

Scoring needs its own authorization. **Immediately before scoring**, from the same clean checkout, run the verifier again; scoring must not start unless it exits 0.

20. Window A, folder `scrb-run-pin`, administrator: no. The output goes into the run record.

    ```powershell
    Set-Location 'C:\Users\bchen\Documents\GitHub\scrb-run-pin'; $r = & 'C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe' -I '.\scripts\gate3-retest\verify-against-manifest.py' --manifest 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json' --approved-manifest-sha256 <APPROVED_SHA256> --checkout 'C:\Users\bchen\Documents\GitHub\scrb-run-pin'; $code = $LASTEXITCODE; $r | Out-File -Encoding utf8 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>\verifier-before-scoring.txt'; Add-Content -Encoding utf8 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\<run name>\run-record.txt' ("{0}`tverifier before-scoring exit code {1}; output verifier-before-scoring.txt" -f [DateTime]::UtcNow.ToString('o'), $code); "exit code: $code"
    ```

    `exit code: 0` is required. Any other value (or a `MISMATCH:` line): do not score; paste the output to the agent.
21. The scoring itself follows the freeze-surface list, "Scoring-time procedure: occurrence-matcher binding (D6)". It is run by the agent and is not a command in this runbook.

Where the evidence ends up, in `PREFLIGHT\<run name>\`: `raw.jsonl` (observer), `actions.log`, `run-record.txt` (UTC times, manifest SHA-256 values, orchestrator SHA-256, checkout commit, Python version, verifier output file names and their hashes), `verifier-before-capture.txt`, `verifier-after-capture.txt`, `verifier-before-scoring.txt`, `frames\`, `resources.csv`, `playback-log\`, `playback-stdout.txt`, `playback-stderr.txt`, `observer-stdout.txt`, `observer-stderr.txt`, `recording-ready.txt`, and the copied `screen-recording.mp4`. The app's recording and library are in `PREFLIGHT\<run name>-app\`.

## REHEARSAL variant (60 seconds; **needs the owner's written authorization before it records**)

A rehearsal checks that the orchestrator, the verifier, the Snipping Tool steps, the overlay and the playback readiness work together, before the scored run. **It is not scored.** Its output is not used as evidence for any gate decision, and it is kept (not deleted) per `docs/gates/evidence-retention-policy.md` until you authorize cleanup.

- Do Parts 1 and 2 as written, with run name **`rehearsal-1`** (so the folders are `PREFLIGHT\rehearsal-1` and `PREFLIGHT\rehearsal-1-app`; a new, different name from the scored run). A fresh app profile is needed again, so run step 10 with `-RunFolder '...\rehearsal-1-app'`.
- Suggested `-ObserverSeconds` for 60 s: 30 + 60 + 30 + 3 + 60 margin = 183, so **185**.
- Step 14 command (Window A, folder `scrb-run-pin`, administrator: no):

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'C:\Users\bchen\Documents\GitHub\scrb-run-pin\scripts\gate3-retest\run-scored-run.ps1' -AppPid <PID> -EvidenceDir 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\rehearsal-1' -ManifestPath 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\approved-manifest\windows-gate3-v3-preflight-manifest.json' -ApprovedManifestSha256 <APPROVED_SHA256> -ObserverSeconds 185 -RecordSeconds 60 -DrainSeconds 30 -PreflightDir 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108' -Python 'C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe'
  ```

- Playback is the same 420 s source but is stopped at 60 s, so the speakers play for about one minute. Expected orchestrator time: about 3 minutes.
- The rehearsal is the first time the new checks run against the real app. Report from `actions.log`: the `app Stop control seen ... ms after Record` line (the capture-start delay), whether `run-record.txt` shows the `app PID ... bound` line and ends with `run finished`, and any `WARNING:` line. It is also the first time the PowerShell orchestrator's abort paths could be seen; they are not exercised unless something fails.
- Afterwards do the abort rules above if anything fails, copy the video (step 17), and do not run Part 5 for the rehearsal. The real run still needs a new app profile (`scored-run-1-app`) and a new evidence folder.

## Not covered here

Threshold changes, a freeze, a merge, deleting evidence and the scoring commands are not part of this runbook. The manifest stays NOT_FROZEN until you approve it in writing.
