# Gate 8 overnight long run: owner runbook

**Status:** prepared, not run. Independent review pending. No test of more than 5 minutes has been started. The Mac script was smoke-tested for 5 minutes (section 9). The Windows script was written but **not run anywhere**: its 5-minute smoke on each Windows PC is the first thing to do there.

**What it proves:** the real capture helper, left alone for 8 hours, with an invented 880 Hz tone on the meeting track and the default mic, loses no audio, keeps both tracks in step, and does not grow in memory. It is the recorder only: no transcription runs, so there is no final pass to check, and the 6 GB whole-app budget needs the app's own run. Gate 8 also needs the installed-build criteria (not covered here).

## 1. Before you start

| Item   | Mac                                                                                         | Windows (BCHEN-W10, then Regiurn)                                     |
| ------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| App    | The Claude app's **Terminal panel** (not a plain shell: it has the audio permission, see 8) | PowerShell window, normal user                                        |
| Folder | `/Users/brandonchen/Documents/GitHub/scrb` (repo root, on a branch that has this script)    | the repo root                                                         |
| Admin  | **No**                                                                                      | **No**                                                                |
| Power  | Plugged in, lid open, display allowed to stay on                                            | Plugged in; the script keeps the PC awake while its window stays open |
| Disk   | see section 2                                                                               | see section 2                                                         |
| Room   | Quiet. The mic records the room for 8 hours.                                                | Same. Speakers are muted by the script (restored after)               |

Close other apps and leave the machine alone overnight: a busy Mac stalls capture and the report shows it as marked gaps (see section 10). Do not log out, close the lid, or start another recording app. Run one machine per night, one at a time (the two Windows PCs may run the same night, each on its own).

Windows prerequisites (unverified here): `node` on PATH; `native\windows-capture\build\bin\scrb-capture.exe` built with `build.cmd`; `TonePlayer.exe` and `Mute.exe` present under `native\windows-capture\tools\`. The README notes Windows keeps per-app volume-mixer mute by path, so confirm in the smoke that the meeting track has sound. On BCHEN-W10 the random screen and speaker shutoff may show up as marked gaps; a failure there counts as a finding, not a script bug, so write down the time you notice it.

## 2. Disk space

- Mac: the tone is generated as a temporary 460 MB file and removed after conversion; the recording is about **0.3 GB** for 8 hours (the smoke wrote 3 MB in 5 minutes; scaled). Keep **at least 5 GB** free.
- Windows: the tone player makes its own sound; recording is similar. Keep **at least 5 GB** free.

## 3. Smoke first (5 minutes, safe, needs no approval)

Both scripts default to a 5-minute run. A longer run happens only when you pass an explicit duration (section 4). Every run needs a new or empty evidence folder outside the repo; the script refuses the repo, anything under it, and a folder that already holds files, so a past run is never overwritten. Without `--out` it picks a new timestamped folder.

Mac:

```bash
scripts/long-run/overnight-mac.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\long-run\overnight-win.ps1
```

Expect `RESULT: PASS` at the end. It is labelled SMOKE and is not Gate 8 evidence.

## 4. The real run (needs the approval in section 7)

Only after the approval in section 7. Mac (finishes in about 8 hours; prints a line every minute):

```bash
scripts/long-run/overnight-mac.sh --hours 8
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\long-run\overnight-win.ps1 -Hours 8
```

Other length: change the number. Any run expected to exceed 20 minutes still needs your approval first.

## 5. Stop early, safely

Either press Ctrl+C **once** in the window, or create an empty file named `STOP` in the evidence folder:

```bash
touch ~/scrb-long-run/<folder name>/STOP
```

```powershell
New-Item $env:LOCALAPPDATA\scrb-long-run\<folder name>\STOP
```

The script then stops the helper normally, seals the audio and prints the report. An early stop is labelled in the report and is not 8-hour evidence. Never kill the helper by hand: the report would then show a crash recovery.

## 6. Where evidence goes, and what to send back

Evidence folder (outside git, never commit it): Mac `~/scrb-long-run/<timestamp>/`; Windows `%LOCALAPPDATA%\scrb-long-run\<timestamp>\`. Keep the whole folder, including the audio, until you pass Gate 8 and authorize cleanup (evidence retention policy). The mic may have heard your room: do not share the audio.

Send back only: `REPORT.txt`, `logs/samples.csv`, `logs/run.json`, `run.log`, plus the machine name, start and end times, and anything you noticed (a sleep, a shutoff, a notification).

## 7. Approval request (say this, filling the blanks, before the real run)

> I approve one unattended Gate 8 long run of **8 hours** on **[Mac / BCHEN-W10 / Regiurn]**, recording an invented tone and the default mic through the real capture helper, using about **[DISK, about 0.3 + 0.5 temporary] GB** of disk in a folder outside git, starting about **[start time]** and finishing about **[start + 8 h]** (plus a few minutes to seal and report). I know it does not run transcription. No other test over 20 minutes is approved.

## 8. Mac permission prerequisite

The meeting track uses a macOS process tap. A shell without the audio permission gets `permissionLost` on the meeting track after a few seconds, the track stops at one chunk, and the report fails (the first smoke from the agent's own shell did exactly this). The Claude app's Terminal panel has the permission. If it ever reports `permissionLost` there: System Settings, Privacy & Security, Screen & System Audio Recording (and Microphone), allow the Claude app, then restart the app. Do not start the 8-hour run until the 5-minute smoke shows both tracks growing.

## 9. Pass and fail thresholds

From the Development Plan quality targets unless marked "this test". The script prints PASS or FAIL for each and ends with `RESULT: PASS` or `RESULT: FAIL`.

| Check                  | Pass                                                                                         | Source                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Lost audio, each track | None: zero gaps, none marked, audio within 1.5 s of the timeline                             | Plan: "None; any gap is shown and marked". Stricter here: any marked gap is a finding for you to judge |
| Chunk continuity       | Numbers run 0, 1, 2... without a break; no `.part` or `.tmp` left; none damaged or recovered | this test                                                                                              |
| Drift between tracks   | Under 50 ms in any 4-hour window (the 8-hour 100 ms target at the same rate)                 | Plan: sync drift. Measured from chunk start times on both tracks, not from a shared sound              |
| No stalled minute      | Chunk count grows on both tracks every sample                                                | this test                                                                                              |
| Memory (recorder)      | Peak under 1 GB, growth from 10% of the run to the end at most 50 MB or 10%                  | this test; the plan only gives 6 GB for the whole app with live transcription                          |
| CPU                    | Under 10% of one core on average                                                             | Plan: CPU while recording only                                                                         |
| Clean stop             | Helper exits 0 on stop; timeline within a few seconds of wall time                           | this test                                                                                              |

A FAIL is not automatically a product bug: read the line, check the log around that time, and send the folder summary back.

## 10. Smoke result on the Mac (5 minutes, 2026-11-13)

Run from the Claude app Terminal panel with the helper built from `main`. Both tracks grew every sample; helper memory stayed at 10-16 MB and CPU near 3% of a core. A first smoke from an agent shell without the audio permission failed as designed (meeting track `permissionLost`, report FAIL), which is how section 8 was found.

```text
run: darwin, planned 300 s (SMOKE, not Gate 8 evidence), ended: planned duration reached, started 2026-11-14T03:33:44.805Z
recovery outcome ready, timeline 300.060 s, helper events {"health":296}
PASS  helper ran to a clean stop: planned duration reached; exit {"code":0,"signal":null,"atMs":300306.269292}
PASS  timeline covers the run: timeline 300.060 s against 300.0 s of wall time
PASS  microphone chunk continuity: 60 chunks, 0 numbering breaks, 0 .part/.tmp left, 0 damaged, 0 recovered after a crash
PASS  microphone no lost audio: gaps total 0.000 s, longest 0.000 s, 0 marked, 0 unmarked, 59 overlaps; audio 300.053 s of 300.060 s (difference 0.006 s)
PASS  meeting chunk continuity: 60 chunks, 0 numbering breaks, 0 .part/.tmp left, 0 damaged, 0 recovered after a crash
PASS  meeting no lost audio: gaps total 0.000 s, longest 0.000 s, 0 marked, 0 unmarked, 59 overlaps; audio 300.043 s of 300.060 s (difference 0.017 s)
PASS  drift between tracks under 50 ms in any 4 h: worst 0.00 ms in a 4 h window, -0.00 ms over the whole run (-0.00 ms per hour), 59 rollover steps. Track timelines, not a shared sound
PASS  no stalled minute: 0 samples where a track's chunk count did not grow
PASS  memory bounded (helper): peak 15.5 MB (limit 1024), 13.8 MB at 0.01 h, 9.9 MB at the end, growth -3.9 MB (limit 50.0). The 6 GB whole-app budget is measured by the app run, not here
PASS  CPU average under 10% (helper, recording only): 3.03% of one core, highest sample 3.80%
final pass: not applicable (recorder only, no transcription)
RESULT: PASS
```

Two later 5-minute smokes with the 5-minute default: the first (Mac under heavy load from other work, load average about 10) **failed** the lost-audio check with about 1 s lost per track in short marked gaps, mostly at 29-31 s on both tracks at once, which fits a host stall; the rerun on a quieter Mac passed (`RESULT: PASS`, no gaps, drift 0.00 ms, helper 14.5 MB peak, 2.4% of a core). The cause of the first failure is not proven. Treat any gap in the real run as a finding and note what else the machine was doing.
