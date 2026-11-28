# Turn-boundary attribution: candidate replay (2026-11-27)

Result: no candidate meets the acceptance rule (clean-word wrong rate down at least 0.5 point, no meeting worse). No production code changed. Numbers only; AMI public meetings, no owner recordings.

## Method

Replay, no re-decode. Input: the saved spans and whisper words from the [diagnosis](boundary-attribution-diagnosis-20261125.md) run (ES2004a, IS1009a, TS3003a, first 15 min). Each candidate relabels whisper words; reference speakers map one to one to final speakers by the baseline labels, and the same mapping scores every candidate. Scored words: clean words (overlap no other reference speaker) that match a whisper word by text within 1.5 s. That is 3,112 of the 4,263 clean words in the diagnosis, so the baseline rate (3.2%) is lower than the diagnosis rate (4.3%, which used reference word times).

Candidates:
- Trim: where two spans of different speakers overlap, cut both at the middle of the overlap, then assign as now.
- Snap: after assignment, move each speaker change to the nearest gap between whisper words of at least a minimum length, within a reach limit; skipped when another change lies in between.

## Results

| Candidate | ES2004a wrong | IS1009a wrong | TS3003a wrong | All, wrong rate |
| --- | --- | --- | --- | --- |
| Now | 40 of 1,101 | 52 of 1,054 | 8 of 957 | 100 of 3,112 (3.21%) |
| Trim | 35 | 52 | 8 | 95 (3.05%) |
| Snap, 250 ms pause, 1 s reach | 36 | 51 | 8 | 95 (3.05%) |
| Trim and snap | 31 | 52 | 8 | 91 (2.92%) |

Best gain 0.29 point, short of 0.5. No meeting got worse. Pause 100 or 150 ms and reach 2 s gave the same or smaller gains (0.10 to 0.29 point).

## Why the gain is small

- Whisper word times are mostly back to back: only 91, 103 and 8 gaps of 250 ms or more in the three meetings (about 1,600, 1,600 and 1,250 words), so snapping rarely has a pause to land on. TS3003a has almost none and does not move.
- About 60% of the wrong words come from the diarizer (short turns, uncovered words), which neither candidate touches.

## Decision

Not shipped: 0.29 point is below the rule and rests on 3 meetings and 100 wrong words. Larger gains need short-turn recall in the diarizer (diagnosis, recommendation 2), which is out of scope here. Pause snapping on reference times would look better but cannot be used, since production only has whisper times.
