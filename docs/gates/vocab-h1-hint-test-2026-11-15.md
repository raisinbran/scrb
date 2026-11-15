# H1 hint test — INCONCLUSIVE (completed 2026-11-15)

**Result: INCONCLUSIVE.** The unchanged pre-registered bars are not met for “hints can help” or “cannot help.” At 10 terms, recall increased in both meetings, so the “cannot help” bar (no recall gain in either meeting) is not met. ES2015c 10-term WER rose by 0.55 percentage points, exceeding the allowed 0.3-point increase; ES2003c also had three false events from the 30 distractor terms in its 40-term run. The result is not a pass for hint effectiveness.

## Setup and retained evidence

- Owner approval for H1 and the two pinned AMI meeting downloads was given on 2026-11-15. Only calibration meetings ES2003c and ES2015c were used; no held-out meeting or private recording was accessed.
- The `vocab-eval` fetch group in `scripts/dev-assets.sh` fetched both AMI audio files using the owner-provided SHA-256 pins. ES2003c: 72,221,740 bytes, `828faf52f14ae584c299c35009fa519b4780bfcc2c966288eebb6af091ef0fd7`; ES2015c: 68,348,632 bytes, `50999075fa47769474ecb2b39629db674f0b2a33ca5368df6af07ea106253dcb`. The existing pinned annotation archive hash also matched. C: had over 139 GB free.
- Whisper.cpp `284029c07012d2000941a08d38a31ffb71f4734e`; large-v3-turbo-q5_0 model and Silero VAD hashes matched `scripts/model-digests.json`.
- Each meeting’s 10-term `terms.json` was frozen before any hint-on run. The 40-term set added 30 distinct reference words from the other calibration meeting, absent from the target reference. The exact sets and selection provenance are in the retained eval folder.
- Raw decoder JSON, stdout/stderr, command log, terms, and scorer outputs remain on this PC under `C:\Users\brand\scrb-dev-assets\eval-vocab\h1-2026-11-15\`; none are committed or deleted. ES2003c hint-off output from the earlier run was reused and not repeated.

## Decode times

| Meeting | Condition | Result | Time |
| --- | --- | --- | ---: |
| ES2003c | Hint off, -mc 128 | Earlier retained run, exit 0 | 1,029.8 s (17:09.8) |
| ES2015c | Hint off, -mc 128 | Exit 0 | 834.0 s (13:54.0) |
| ES2003c | Hint on, 10 terms, -mc 128 | Exit 0 | 801.4 s (13:21.4) |
| ES2003c | Hint on, 40 terms, -mc 128 | Exit 0 | 809.2 s (13:29.2) |
| ES2015c | Hint on, 10 terms, -mc 128 | Exit 0 | 761.9 s (12:41.9) |
| ES2015c | Hint on, 40 terms, -mc 128 | Exit 0 | 732.4 s (12:12.4) |

The five additional decodes totaled **3,938.9 s (65:38.9)**, below the approved 100-minute hard cap. All six H1 decodes totaled 4,968.7 s (82:48.7). Each decode ran once; none were rerun. No H1 decode remains unrun.

## Scored results

WER comparison for the pre-registered 10-term test is hint-off versus hint-on 10 terms. Recall counts use the same target-reference occurrences for 10- and 40-term runs because distractors do not occur in the target reference.

| Meeting | 10-term recall off → on | 10-term WER off → on | 40-term recall | 40-term distractor false events |
| --- | ---: | ---: | ---: | ---: |
| ES2003c | 69/96 → 78/96 | 25.72% → 25.16% (−0.56 points) | 79/96 (≥ 78/96) | 3 |
| ES2015c | 110/144 → 120/144 | 22.43% → 22.99% (+0.55 points) | 120/144 (≥ 119/144) | 0 |

The existing scorer `scripts/research/score_vocab_eval.py` produced the retained `score10.json` and `score40.json` files per meeting. The ES2003c 40-term output had six total held-out events, three of which matched distractors; ES2015c had zero distractor events. The scorer’s event list was filtered against the 30 distractors per meeting for the registered distractor check.

## Pre-registered bars

- **HINTS CAN HELP:** not met. ES2015c 10-term WER increased by 0.55 points, beyond the permitted 0.3; ES2003c had three distractor events at 40 terms.
- **HINTS CANNOT HELP:** not met. 10-term recall rose in both meetings.
- **Verdict: INCONCLUSIVE.** The bars are unchanged; no additional terms, meetings, or thresholds were introduced.

Prior incidents A-428, A-422, A-423, and A-424 cover earlier setup/reporting issues on this task. A-426 records a progress-update arithmetic error during this completion; the corrected runtime total is 65:38.9 minutes as shown above.
