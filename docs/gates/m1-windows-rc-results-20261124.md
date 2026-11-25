# Windows M1 release candidate: local build, install and agent-only B0, 2026-11-24

Owner authorization 2026-11-24 ("proceed with the windows test"): local NSIS build (W1.1), standard-user install/launch/uninstall then install for B0 (W1.2), one agent-only B0 run of at most 60 minutes (W1.4). Host: BCHEN-W10 (Windows 11 Pro for Workstations 10.0.26300). Raw audio, transcripts, installer and screenshots stay in `C:\Users\bchen\scrb-b0-win-20261124` (not committed, nothing deleted). The owner's library and recordings were never opened.

## Verdicts

| Cell                          | Result                                                                                                                                                                            | Reason                                                                                                                                                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks     | **NOT VERIFIED**                                                                                                                                                                  | The microphone track has no usable end beep (and only a 40 ms start tone against the 120 ms detector minimum), so `b0-track-sync.mjs` exits 2. Meeting-track beeps and chunk gaps are fine. Bleed sub-limit not claimed (issue 487).                                                  |
| 2 Live text                   | **NOT VERIFIED** (owner decision pending); not measured. Note: the owner waived cell 2 for the Mac run only                                                                       |                                                                                                                                                                                                                                                                                       |
| 3 Final text, distinct voices | **NOT VERIFIED** (formal three-route protocol); diagnostic remote-separation result: **FAILED**                                                                                   | All three SAPI voices, including Y, came from the speakers, not the distinct local-microphone Y route of the frozen protocol, and the owner did not approve that substitution. Observed: 29/30 recognizable; A and B merged into one speaker id (B 0/10 attributed), A 10/10, Y 9/10. |
| 4 Audible seek                | **NOT VERIFIED** (owner decision pending); a software-path seek check passed (see Persistence) but is not audible. Note: the owner approved this replacement for the Mac run only |                                                                                                                                                                                                                                                                                       |
| 5 Clipboard parity            | **PASS**                                                                                                                                                                          | Pasted text identical to the text rebuilt from `transcript.json`: 26 sections, 1,592 characters.                                                                                                                                                                                      |
| Persistence                   | **PASS** (automated, software path)                                                                                                                                               | Quit, relaunch, transcript hash unchanged, labels kept, both tracks play, one seek lands where asked.                                                                                                                                                                                 |

## W1.1 Build

- Source: `origin/main` `c94993424c838bea2c80a1c26be5d209f51086bf` (worktree `scrb-w10rc`, branch `cod/m1-windows-rc-20261124`). Node 22.23.4 (the PC default is Node 26, which `package-win-installer.ps1` refuses); `npm ci`; `scripts/package-win.ps1 -Slice 3` ("Verified slice 3 package: 7 executables, 12 DLLs, 7 license/notice files"); `scripts/package-win-installer.ps1`. Built on the first attempt.
- Tool stage: not rebuilt. The staged `win-stage\bin` of the earlier W10 candidate (`73e899d0`) was copied; `git diff 73e899d0..HEAD` over `native/windows-capture/src`, its CMake file and `packages/transcription/native` is empty, and `verify-win-package.mjs` passed on the package. `PROVENANCE.json` SHA-256 `502172bd77cedc22fbc041a5d093eaaaee6cff828acb11a69f93493bd28b9969`; `DEPENDENCY-AUDIT.json` `57afa242b981ba88e0d3a93c4aa380cc623c920a4489dae4618173a2289751f2`. Tools: whisper-cli, whisper-server, whisper-vad-speech-segments, scrb-sherpa, scrb-capture, ffmpeg, ffprobe (whisper.cpp 1.9.5-dev commit 284029c0, sherpa-onnx 2.0.1, ffmpeg 9.0 per the provenance file).
- Installer `Scribe Setup 0.1.0.exe`, 131,071,877 bytes, unsigned, per-user: SHA-256 **`70c204f4fab7444179fa88e61b34c48b7b69e2d7133514e8abf7fd36566855e8`**. Installed `Scribe.exe` SHA-256 `55b7c7f0be39eec6f4e8b1f8c05b5a7d1e68624f097ff71b877efb40f3c17d55` (equals the candidate manifest's application hash). Kept locally; not committed or uploaded.
- Models (outside the installer, in `%LOCALAPPDATA%\Scribe\models`): ggml-large-v3-turbo-q5_0, ggml-small.en-q5_1, ggml-silero-v6.2.0, 3dspeaker eres2net, segmentation-model.int8 copied from the local model handover folder; all five SHA-256 values equal `model-digests.json`. Qwen3.5-9B (summaries) was not installed; it is not part of B0.

## W1.2 Install, launch, uninstall (about 4 minutes)

- Account `bchen` (Administrators member, filtered token, medium integrity, not elevated); no UAC prompt, so no separate standard-user account was needed or used. `Scribe Setup 0.1.0.exe /S`: exit 0 in 11.9 s, installed to `%LOCALAPPDATA%\Programs\@scrbdesktop`, 23 files in `resources\bin`, per-user uninstall entry.
- Launch on an isolated profile (`--user-data-dir` and `--scrb-isolated-test-profile`, temp profile and library `scrb-b0w2-*`): Live screen, no location dialog (`install-launch.png`).
- Uninstall (`Uninstall Scribe.exe /currentuser /S`): exit 0; install folder, uninstall entry and Start Menu shortcuts gone; models folder kept. Reinstall: exit 0, same `Scribe.exe` hash.

## Isolation and seeding

The packaged app ignores `SCRB_DEV_AUTO_LOCATION`. The location was saved instead by running the unpackaged build of this worktree once with `SCRB_DEV_AUTO_LOCATION=1` on the same isolated temp profile and library (the existing settings handler; no dialog was clicked or automated). The installed app then opened that library with no dialog. Playwright's Electron launcher could not start the installed `Scribe.exe` ("Process failed to launch", cause not established), so the installed app was started normally with `--remote-debugging-port` and driven over that port. Isolation evidence: the profile and library are the temp folders; `%APPDATA%\@scrb` (an old profile from 2026-11-16) had no file written in the hour; `Documents\Meeting Scribe` was not read. There was no handle-level proof (no `lsof` equivalent was run). The Recordings list also shows sample meetings (Budget review and others); they match the UI mock fixtures and are probably merged in by the hybrid backend; not investigated.

## B0 setup

- Frozen script, slot times (`3.5 + 9(k-1)` s), start beep 1.8 s and end beep 274.0 s, 16 kHz mono `remote.wav`, longest turn 4.6 s. Synthetic Windows SAPI voices: Y Zira (female), A David, B Mark at the slow rate (all three through the speakers; Y is not an owner voice). Median pitch of the rendered turns: Y 176 Hz, A 93 Hz, B 138 Hz.
- Played with `System.Media.SoundPlayer` to the default speakers (Realtek). Microphone: Realtek array, default, input volume 100%, microphone privacy Allow (user and machine). Meeting source: whole computer audio.
- Output volume: read 16% at the start (restored to 16% at the end). Preflights at 16%, 30% and 55% (the mic heard the speakers only at 55%). When the main run started Windows read **36%**, and 32% afterwards, not the 55% I had set; the cause is unknown (the same unexplained drift as the Mac run) and I started the run anyway (A-1152). All volume figures are readings, not controls.
- Main run 21:24:29 to 21:29:18 (recording 288.1 s), meeting `2026-11-25 Meeting (4)`, title "20261124 Meeting 4". B0 total about 15 minutes of the 60.

## Cell 1 detail

- `node scripts/b0-track-sync.mjs`: meeting-track beeps at 8.99 s and 281.21 s (spacing 272.22 s, as expected); microphone track "found 0 beep(s)" (exit 2, NOT VERIFIED). A hand check found the microphone start beep cut to a 40 ms tone at 9.10 s and nothing at 281.2 s. In the preflights the microphone start beep was cut to about 80 ms, which looks like Windows microphone processing, not shown.
- Chunk gaps: meeting 61 chunks, largest gap 8.5 ms; microphone 59 chunks, largest 0.5 ms (limit 100 ms).
- An envelope cross-correlation of the two tracks was tried as a substitute and gave weak, inconsistent results (correlation 0.0 to 0.48); it is not used.
- Bleed (reported only): during the scored turns the microphone track averages about -36 to -39 dBFS RMS against -13 to -16 dBFS in the meeting track (about 22 dB lower), with a microphone floor of about -33 dBFS. At the volume that actually played (32 to 36%) the microphone is near its floor, so the figure is inconclusive; no PASS is claimed for the bleed sub-limit. The "You" label holds one fragment, "Four" at 13.0 s.

## Cell 3 detail

Scoring: literal word match, at least 60% of the phrase's words in order inside the turn window (-0.6 s to +1.5 s around the turn, offset 7.19 s from the meeting-track start beep), one global mapping chosen from the recognizable turns. Final text has three speaker ids in use (speaker-1, speaker-2, you) in 26 segments.

| Voice | speaker-1 | speaker-2 | you |
| ----- | --------- | --------- | --- |
| Y     | 0         | 10        | 0   |
| A     | 10        | 0         | 0   |
| B     | 10        | 0         | 0   |

Mapping Y = speaker-2, A = speaker-1, B = none (A and B share speaker-1). Recognizable: Y 9/10 (turn 17, "twelve" written as "12", 0.57; it would be 0.71 if digits counted, a rule I did not change after seeing it), A 10/10, B 10/10, total 29/30. Attributed correctly: Y 9, A 10, B 0. Four extra words in total; omissions not tallied. This is a diagnostic result: A and B are both identifiable, different male voices (median pitch 93 and 138 Hz), so the collapse is a real remote-separation failure, not excused by their sex. It is not the formal cell 3 verdict, because the stimulus departs from the frozen protocol (Y through the speakers). The agent-only stimulus came from the planner's task brief (planner error, A-1154), not an owner approval. Not rerun.

## Cell 5 and persistence detail

- Copy transcript button, then `Get-Clipboard`: identical to the text rebuilt with the `copy-transcript.ts` rule (sorted by first word start; `Label: words`; CRLF to LF): 26 sections, 266 whitespace-separated tokens, 1,592 characters. At copy time the list held 23 rendered rows, 10 of them in the 802 px viewport (`copy-moment.png`), so rows were out of view.
- Persistence: app quit (CDP `Browser.close`), relaunched with the same command; `transcript.json` SHA-256 `14211b1f61f536fa035479a2a691c33306466f78a9953c11b6909f9ad8569511` before and after; labels You, Speaker 1 and Speaker 2 present; "Play from 00:55": microphone and meeting audio elements both playing (chunks 11 and 12), no error, position 58.1 s after 2.5 s and 62.3 s later; "Play from 02:16": both tracks jumped to chunks 27 and 29, position 138.5 s 2.5 s after the click. Audio elements were muted by the test hook, so nothing was audible; this is a software-path check, not cell 4.

## Open items for the owner

1. Cell 3: A and B merged (diagnostic fail). Decide whether to accept the all-speaker substitution (then it stands as FAIL) or run the formal three-route protocol. Not rerun without your yes.
   Also decide whether the Mac waivers for cells 2 and 4 apply to Windows.
2. Cell 1 needs a microphone beep that survives Windows microphone processing, or that processing off; the product behavior is not established.
3. The output volume drifts after being set (Mac and Windows).
4. The test played speech through the speakers at about 32 to 36% in the evening; the earlier rule about aloud tests in a shared room was not re-confirmed because this task authorized speaker playback.

Independent review pending
