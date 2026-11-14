# Rule for "lost audio" in the Gate 8 overnight verifier (2026-11-14)

**Status: written AFTER seeing the Regiurn result, and still needs independent review of its limits before any Gate 8 verdict relies on it.** An independent review of the first version found two serious problems and three smaller ones; this revision addresses them. No evidence has been re-scored with it. The verifier that scored the Regiurn 8-hour run (RESULT: FAIL) is not the one described here.

**All limits below are provisional: chosen after seeing three runs (the 5-minute smoke, and the Regiurn 8-hour microphone and meeting tracks), not calibrated.** The report line for each track says so.

## The problem

On Regiurn's microphone track the check failed because sub-2 ms boundary differences were budgeted by their positive sum only (185.7 ms against 100 ms). The same track had 2,686 matching overlaps (-181.3 ms) that cancel them: every chunk is exactly 240,000 frames, the net boundary difference was +4.4 ms over 8 hours, and the net difference between timeline and audio was 13 ms. About 157 of the 185.7 ms fell in the last hour (a repeating -0.67 ms / +0.67 ms / about 0 pattern after the last restart); its cause is unknown. The meeting track's single 8 ms marked gap is a separate, real small gap and must still fail.

## What is counted

1. **A difference of 2 ms or more, in either direction, is always a finding and is never netted.** A gap is lost audio, reported as marked or unmarked. An overlap of 2 ms or more is counted separately ("overlaps of 2 ms or more", with the largest) and fails the track. Any marked gap on the track also fails it. So one 8 ms gap fails, and 50 gaps of +1.9 ms plus one -95 ms overlap fails.
2. **Only differences with magnitude below 2 ms (the helper's tolerance) are netted,** as a signed sum. The report shows the positive total, the negative total and the net.

## Limits (per track, provisional)

| Limit | Value | Reasoning |
| --- | --- | --- |
| Net sub-2 ms difference in any clock hour (by chunk start) | at most 10 ms (absolute) | Regiurn's worst hour was under 1 ms net; the smoke's positive-only rate was 3.6 ms per hour. A steady 0.5 ms loss per 5 s chunk is 360 ms per hour and fails at once. At most 80 ms can hide across 8 hours |
| Net sub-2 ms difference over the run | at most 100 ms (absolute) | Same figure as the old budget; about 0.0003% of 8 hours |
| Net shortfall, timeline minus summed chunk lengths | at most 100 ms (was 1.5 s) | Observed 9 to 23 ms. The "timeline covers the run" check keeps its own 1.5 s slack |

## What netting does and does not show

**Netting is a measurement of timestamp jitter only. It is not proof of continuous audio.** Matching positive and negative differences of the same size cancel in the sum whether they are clock jitter or a real lost span followed by a real duplicate. Only the net shortfall (timeline against summed chunk lengths, which are fixed-size) bounds that. So when the positive and negative sub-2 ms totals are each over 100 ms while the net passes, the check still PASSES but the report adds the visible line `WARN  <track>: large cancelling jitter, continuity not independently shown`. The Regiurn microphone track would produce it. Nothing here shows the audio was continuous; only listening or a sample-level check could.

## Code and tests

`scripts/long-run/guards.mjs`: `scanGaps` (never nets a difference of 2 ms or more), `judgeLostAudio` (the pass/fail decision and the warning) and `LOST_AUDIO_LIMITS`. `scripts/long-run/overnight.mjs` calls `judgeLostAudio`. Tests in `scripts/long-run-guards.test.mjs` run the decision on synthetic chunk logs: 50 x +1.9 ms plus one -95 ms overlap FAILS; alternating +/-1.9 ms PASSES with the warning; one 8 ms gap FAILS; marked and unmarked are reported separately; accumulating small loss and a large net shortfall FAIL.

## Not verified

The limits themselves, and any behaviour on a real run: the new code has only run against synthetic data and the unit tests.
