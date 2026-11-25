# Mac B0 Teams run 2, cell 2 (live text, three voices): scoring from the screen video

Date: 2026-11-24. Method: frozen cell 2 rules in `docs/gates/m1-mac-b0-run-sheet-20261124.md` section 7. Agent-only, read-only on the run folder.

## Verdict: NOT VERIFIED

Live text was not observable on screen while the 30 turns were happening, so no delay, no within-6-s count and no per-voice recognition can be scored. This is the run sheet's NOT VERIFIED condition ("live text not observable"). No PASS is claimed and no FAIL is claimed.

## Evidence

- Video: `main-run.mov`, whole display, 600 s, 3420x2214. Frames read through AVFoundation, text read with macOS Vision OCR (the bundled ffmpeg has no image encoders, so it could not write frames).
- Clock offset (video to meeting track): the floating Scribe recording widget shows a visible timer. Timer read 00:45 at video 160.0 s and 01:00 at 175.0 s, so the timer started between 114.0 and 115.0 s of video: video time = track time + about 114.5 s (plus or minus 0.5 s, the timer's one-second resolution). Cross-check: the widget's Meeting level meter and the cue page's own timers agree within that error; the start beep (track 53.49 s) falls at about video 168.0 s, where the timer reads 00:53.
- During the turns (video about 115 s to 445 s, which covers all 30 slots: last slot 304.5 file s, track 316.2 s, video about 430 s) the only Scribe element on screen was the small floating widget. A once-per-second OCR of that widget over video 112 to 460 s found the recording timer, the labels "You" and "Meeting" and level bars only. No transcript words appeared in it. The full Scribe window with the Live transcript was behind the Teams window and the Claude window the whole time.
- The Scribe window first appears at video 448 s (timer 05:33), after all turns and at the moment Stop was pressed. It then shows the accumulated live list, with in-meeting timestamps (for example "Meeting 01:40 A small violet kite floated above the park."), but no wall-clock time at which each line first appeared.

## Why nothing can be scored

- Delay (median at most 3.0 s, 29 of 30 within 6.0 s): needs the first moment each line became visible. None was visible before 448 s, so all 30 turns would be missing, which is invalid evidence rather than a measured failure.
- Per-voice recognition and attribution: the live view uses only two labels, "You" and "Meeting". It does not separate remote voices A and B, so a one-to-one live-label mapping for three voices cannot be written (`mapping-final.json` is the final-pass mapping and must not be used to rescue live scoring).
- Non-scoring observation, not a figure: the end-of-run live list reads like the turns, with small word errors ("3 paper folders", "Fresh orange slices filled to ceramic bow").

## What a valid retry needs

Keep the Scribe Live window in front and visible on the recorded display for the whole run (move the Teams call to a second display or a smaller window beside it), keep the video on, and use the same schedule. Retry is the planner's call under the run sheet's no-retry rule; this document does not authorize one.
