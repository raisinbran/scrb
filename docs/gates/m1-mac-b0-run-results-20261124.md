# Mac B0 run, 2026-11-24: ABORTED at preflight (all cells NOT VERIFIED)

Owner-approved single 60-minute run (11:25 to about 11:40 PST used, 15 minutes). Limits and protocol unchanged from the run sheet ([m1-mac-b0-run-sheet-20261124.md](m1-mac-b0-run-sheet-20261124.md)). Candidate rebuilt from `MAC_RC_SHA` `e6c0056a0e910bb86dbeccaeb8f56fee2f5cf257` (the M1.4 built app was no longer on disk). Raw evidence stays in `~/scrb-b0-20261124` (not committed, not deleted).

## Result (Mac column)

| Cell                                       | Result       | Reason                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks                  | NOT VERIFIED | Run aborted; the microphone track ended about 3 s after start in both preflights (`closeReason: permission`, no sound), so no mic beep was ever found (`b0-track-sync.mjs --list`: `micBeepsS: []`). Meeting track did record (start beep at 2.61 s in preflight 2).   |
| 2 Live text, three voices                  | NOT VERIFIED | No main run. Preflight observation only: meeting-track live text showed remote A and B lines with speakers muted outside the beep window, so the process tap works under mute on Darwin 27.0.1. Not a scored result.                                                   |
| 3 Final text, distinct voices              | NOT VERIFIED | No main run, no final pass.                                                                                                                                                                                                                                             |
| 4 Audible seek                             | NOT VERIFIED | No main run; earcup test not done.                                                                                                                                                                                                                                      |
| 5 Copy parity                              | NOT VERIFIED | No transcript produced by a main run.                                                                                                                                                                                                                                   |
| Persistence                                | NOT VERIFIED | No main run; library baseline compromised (below).                                                                                                                                                                                                                      |

These are environment and procedure findings, not product FAILs: the cause of the dead mic track is undetermined (see "For the planner").

## What happened

1. Install: rebuilt RC (files digest `88666a8ce1aa91ceb1ac49cfafab1eb391d0b06a23acb4365ca7df7c87c920d8`, links digest `30001a5475c519e41407606d1b6bb0d591beaf67820c17cf034053a7395f88af`, codesign OK, id `com.raisinbran.scribe`). Backup and rollback rehearsal on a throwaway copy passed (backup, swap, rollback, injected failure with automatic rollback). Real swap OK.
2. Isolated launch: the first `launch` hit the script's 30 s assertion although the app had already opened the isolated library (log `library-opened`); a manual relaunch with the same profile showed `index.sqlite` of the temp library held and nothing under `~/Documents/Meeting Scribe`. Owner clicked a state (no automation). Settings text was not read (view obscured; isolation was proven with `lsof` instead).
3. Preflight 1: owner pressed Start late, so the start beep and early speech were missed (my timing error, A-1138). Preflight 2 (playback started by a watcher after recording began): the meeting track had the start beep (2.61 s) and live text; the microphone track closed at 3.0 s with `permission`.
4. The owner confirmed Scribe was ON under Privacy > Microphone. I asked them to toggle it; macOS relaunched Scribe without the isolated flags and that instance opened the owner's real library for about 90 s until the owner quit it (A-1139). Library abort condition: file count 7923 unchanged, `index.sqlite` mtime 1795548432 -> 1795549094 (the baseline was taken at 11:28 after the previous app closed at about 11:27).
5. Rolled back with `b0-mac-swap.sh rollback`: `/Applications/Scribe.app` fingerprint equals `backup.sha` (`files=fe6a33f8...7d7294`, same links digest). Volume restored to 6, unmuted (owner had allowed 40 for the beeps).

## Deviations and corrections

- Run-sheet fix 1: rehearsal now creates `$REH/b0/.b0-run` (edited in this PR).
- Run-sheet defect found: `say -o x.aiff --data-format=LEI16@16000` fails (AIFF needs big-endian) and the bundled ffmpeg cannot read AIFF; I wrote WAV (`--data-format=LEI16@16000`, `.wav`). Same voices and text; turn lengths all under 7.5 s (longest 2.91 s). My deleted files were only the empty failed `.aiff` outputs.
- `launch`: the 30 s assertion is too short for a first launch of a new ad-hoc build.
- Screen capture needed the owner to allow Screen Recording; owner did.

## For the planner

- Whether the dead mic track is the stale grant for the replaced ad-hoc signature (owner reported Scribe already ON) or a product or Darwin 27 capture issue is unknown. Do not repeat the toggle-while-running step; quit the app first.
- Check the owner's library is intact (candidate opened it for about 90 s).
- No automatic repeat was made, as instructed.
