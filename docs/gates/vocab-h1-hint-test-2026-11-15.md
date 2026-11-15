# H1 hint test — INCONCLUSIVE (incomplete run, 2026-11-15)

**Status: INCONCLUSIVE — the H1 pre-registered bars were not evaluated.** Owner approval for the H1 run and the two specified downloads was given on 2026-11-15. The test stopped after one hint-off baseline because measured decode time put the remaining five runs beyond the approved 56.25-minute ceiling. This is not evidence for or against hint effectiveness.

## Pinned assets and environment

- Pulled main at f258188f51324362d9c7176818ff1c54a90fe7fa; work continued on cuc/vocab-h1-hint-test.
- Added a vocab-eval group to scripts/dev-assets.sh with the two owner-provided pins and the already pinned annotation archive.
- ES2003c.Mix-Headset.wav: 72,221,740 bytes; SHA-256 828faf52f14ae584c299c35009fa519b4780bfcc2c966288eebb6af091ef0fd7.
- ES2015c.Mix-Headset.wav: 68,348,632 bytes; SHA-256 50999075fa47769474ecb2b39629db674f0b2a33ca5368df6af07ea106253dcb.
- The vocab-eval fetch group completed; both downloaded WAV hashes match. The existing annotation archive hash also matched.
- Whisper.cpp: 284029c07012d2000941a08d38a31ffb71f4734e. Model and VAD hashes matched scripts/model-digests.json. C: had more than 139 GB free.

## Completed run

| Meeting | Condition | Decode result | Time | Reference words | Errors | WER |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| ES2003c | Hint off, -mc 128 | Completed once, exit 0 | 1,029.8 s (17.16 min) | 6,077 | 1,563 | 25.72% |

The baseline used the same whisper.cpp build, large-v3-turbo-q5_0 model, Silero VAD, and final-pass flags as the prior AMI runs, with -mc 128. Its JSON output and stdout/stderr are retained at C:\Users\brand\scrb-dev-assets\eval-vocab\h1-2026-11-15\ES2003c\off\; the baseline-only score is in baseline-score.json.

## Stop and remaining work

One of six decodes completed. At 17.16 minutes for the first baseline, five further decodes would project to about 85.8 minutes, exceeding the 56.25-minute cap from the first decode start (2026-11-15 01:04:57 PT). Therefore ES2015c hint-off and all four hint-on decodes were not started. No terms.json was written; no hint-on run occurred; there is no H1 recall, paired WER, or false-event result. The pre-registered bars are unchanged and not assessable from this partial run.

All available raw output remains under C:\Users\brand\scrb-dev-assets\eval-vocab\h1-2026-11-15\; no assets or raw output were deleted or committed. No private recordings were accessed.

The initial wrong annotation path and restricted-shell score-file write are recorded as incidents A-409 and A-410. A-408 records the prior wrong-workspace stop; A-411 records the rejected PR metadata update.
