# Mac M1 final release candidate: install and agent-only B0 cells 2 and 4, 2026-11-24

Owner authorization 2026-11-24 (explicit "go"): build from current `origin/main`, install with `scripts/b0-mac-swap.sh` with rollback backup, one agent-only run of about 35 minutes (over the 20-minute rule), no owner involvement during the run. Evidence stays in `~/scrb-b0-rc-20261124` (not committed, nothing deleted). Isolated temp profile and library only; the owner's library and `Application Support/Scribe` were never opened by the app.

## Verdicts

| Cell | Result | Reason |
| ---- | ------ | ------ |
| 2 Live text, three voices | **NOT VERIFIED** | Setup invalid: in the Playwright-launched app the live feed dropped about 80% of input frames (see below), so the live words are not a fair measurement. No product FAIL is claimed. Raw scoring is shown for transparency only. |
| 4 Audible seek | **NOT VERIFIED** | The room recording carried the click marker clearly, but the played speech was too faint against the room floor to find its onset: envelope correlation with the stimulus was 0.22 to 0.53 and the best lag differed between two takes. No click-to-sound latency can be stated. |

## RC and install

- RC SHA: `9937c3410f82de964ddcac545ebbb7d6fe328e1a` (`origin/main`, includes UI batch #485 and #480). Built with `scripts/package-mac.sh` in worktree `.claude/worktrees/main-build` (build verified by the script).
- Candidate and installed fingerprints (equal): files `9d1f5f22a211ee1b014fab55e674e854e6a9df78116aff05027cf5863773412c`, links `30001a5475c519e41407606d1b6bb0d591beaf67820c17cf034053a7395f88af`. Bundle id `com.raisinbran.scribe`. `codesign --verify --deep --strict` passed on the candidate, after the swap, and again at the end of the run.
- Installed with `scripts/b0-mac-swap.sh backup` then `swap` (output "SWAP OK"); the previous app (main 63749688, files `082606fb...dfad`) is at `~/scrb-b0-rc-20261124/Scribe.app.replaced`, with a second copy `Scribe.app.backup` and `backup.sha`.
- Rollback: `export B0=~/scrb-b0-rc-20261124 && scripts/b0-mac-swap.sh rollback` (quit Scribe first; Node on PATH; run from the repo).
- Not done: the throwaway-copy rollback rehearsal (run sheet section 5 step 5) was skipped to save time; the swap script itself was unchanged since its earlier tested use.
- `tccutil reset Microphone com.raisinbran.scribe` run by the agent before the first launch. The app recorded the microphone without any visible prompt blocking it.
- Owner library before and after, read only: 7923 files, `index.sqlite` size 94208, mtime 1795557814, unchanged. (The mtime differs from the earlier install record because the owner's app was used between.)

## Isolated launch

The packaged app ignores `SCRB_DEV_AUTO_LOCATION`, so the location dialog could not be skipped by flag. The isolated library was seeded instead: `scripts/b0-mac-isolated-launch.sh prepare` made a new temp profile and library, then the saved library copy of an earlier isolated run (`~/scrb-b0-teams2-20261124/evidence/after-main2`, synthetic data, location US/AK already saved) was copied into the new library, and the `meetingAppId` setting in that temp copy's `index.sqlite` was set to `whole-computer`. The app was started with Playwright's Electron launcher, `--user-data-dir=<temp profile> --scrb-isolated-test-profile`. The app launched with no location dialog and showed the seeded and new meetings; Settings storage location was not read on screen, and the `lsof` assertion of `b0-mac-isolated-launch.sh launch` was not run (Playwright launch instead), so isolation rests on the owner library counts above and the temp library's own log (`library-opened`).

## UI batch (screenshots in `~/scrb-b0-rc-20261124/ev`, not committed)

- Purple accent (`--color-accent: #4149b8`), purple level meters and playback bar: `explore-rec2.png`, `ui-4-copy-check.png`.
- Unique auto titles ("20261124 Meeting 3", "20261124 Meeting 2" beside "20261124 Meeting"): `ui-2-unique-titles.png`.
- Floating hint over the transcript ("Double-click a word to correct it...") with a close button: `ui-3-transcript-hint.png`.
- Copy check: after pressing the copy button it shows a check mark (`ui-4-copy-check.png`); the clipboard then held 48 lines, 327 words. Not compared word for word.

## Cell 2: what was run

Frozen script and timing (30 turns, slot `k` at `3.5 + 9(k-1)` s, start beep 1.8 s, end beep 274 s). A and B reused the earlier renders (Samantha, Daniel); the Y lines were rendered with `say -v Fred` into `remote3.wav` and all three voices plus beeps played with `afplay` through the Mac speakers at output volume 30 (deviation: Y is not the owner's microphone voice, as the task set). Recording started in the app, `afplay` 6 s later. Live words were read from the Live window DOM every 150 ms (`data-word-id`, `data-state`) with wall-clock stamps; delay = first appearance of a matching word minus turn end (`afplay` spawn time, start latency unknown, about 0.1 to 0.2 s).

- **Why invalid:** `live-progress` log lines show `meeting.sentFrames` about 125 to 130 per minute and `mic/meeting.inputLostFrames` about 950 per minute for the whole run, against about 600 sent and 0 lost per minute in the earlier Teams run (opened with `open -n`). The saved tracks are complete (no gaps; the final pass produced all 30 lines), so the loss is in the live feed only. Two exploratory launches through Playwright showed the same loss; cause not found (a process started by Playwright rather than by `open` is the only difference known).
- Raw scoring, not a verdict: recognizable turns (at least 60% of the words in order within turn end plus 8 s) 1 of 30 (A 1/10, B 0/10, Y 0/10). Words showed live labels "You" and "Meeting" only, so two remote voices could not be told apart live. Median delay not meaningful.
- Side result from the same recording, with the Y voice also through the speakers: `b0-track-sync.mjs` found beeps at 7.07 s and 279.27 s (mic) and 7.03 s and 279.23 s (meeting): offsets 40 ms at start and end, drift 0 ms. Final text has the three scripted voices present, but the Y lines are split across "Speaker 1" and "You" (bleed through the speakers); this was not scored.

## Cell 4: what was run

Disclosed deviation from the sheet's headphone earcup method: the Mac played the seek through its speakers and the room was recorded by `screencapture -x -v -g -V 14` (the built-in microphone, an app-independent tool; the bundled ffmpeg has no avfoundation input). Targets: Y01 "copper" (S 8770 ms), A05 "suitcase" (speaker-2, S 125720 ms), B10 "glasses" (S 252120 ms), clicked on the word in the final transcript of the cell 2 recording (a click on a word plays from it). A 1 kHz marker beep was played inside the page in the same task as the click so the click time appears in the recording.

- Take 1 at output volume 50 and take 2 at 75 (volume restored to 30 afterwards): the marker is 70 to 80 dB, the speech in the room is only about 10 to 25 dB above a 25 to 35 dB floor. Correlating the stimulus envelope (cut from the clicked word) with the recording gave best correlations 0.22 to 0.53 with different lags in the two takes (for example A05 2.70 s and 4.34 s after the marker). Click-to-sound latency is therefore not measured. An energy rise seen 0.7 to 2 s after the marker is not accepted as a measurement.
- `S` against the reference onset (from stimulus energy, not by ear; word onsets only known to about 0.2 s): copper about -0.11 s, suitcase about -0.41 s, glasses about -0.36 s. These would be inside 500 ms but are estimates.
- First attempt at B10 failed in the script (word row not rendered in the virtual list); the script then scrolled the list. The volume 50 take is kept as `seek-*-vol50.*`.

## Self-induced problems (A-1150, A-1151)

I started the measured cell 2 run without first checking the live feed's frame counters in the exploratory launches (they already showed the loss); the same for the speech level in cell 4 before the first take.

## Next steps (owner decision, nothing run)

A valid cell 2 needs an app launched by `open -n` (no Playwright) and a human or other tool to read the Live window, or the cause of the Playwright-launch frame loss found. A valid cell 4 needs the earcup or a louder or closer recorder.
