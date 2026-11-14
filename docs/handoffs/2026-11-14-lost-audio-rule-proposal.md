# Proposed rule for "lost audio" in the Gate 8 overnight verifier (2026-11-14)

**Status: proposal, written AFTER seeing the Regiurn 8-hour result. It needs independent review before any Gate 8 verdict uses it.** No evidence has been re-scored with it. The earlier verifier (PR #222, `7bac72c`) stays the one that scored the Regiurn run (RESULT: FAIL).

## The problem

On Regiurn's microphone track the check failed because sub-2 ms boundary differences were budgeted by their positive sum only (185.7 ms against 100 ms). The same track had 2,686 matching overlaps (-181.3 ms) that cancel them: every chunk is exactly 240,000 frames, the net boundary difference was +4.4 ms over 8 hours, and the net difference between timeline and audio was 13 ms. About 157 of the 185.7 ms fell in the last hour (a repeating -0.67 ms / +0.67 ms / about 0 pattern after the last restart). The cause of that pattern is unknown. The meeting track's single 8 ms marked gap is a separate, real small gap and must still fail.

## What is counted

1. **A single gap at or above the helper's 2 ms tolerance is always a finding** (counted as lost audio, as now). It is reported as marked or unmarked as now. Any marked gap on the track still fails the check, so the 8 ms meeting gap still fails. No netting ever applies to these.
2. **Boundary differences under 2 ms, positive (gap) or negative (overlap), are netted** as a signed sum. They are reported three ways: positive total, negative total, and net.

## Limits (all on the net, per track)

| Limit | Value | Why it is safe |
| --- | --- | --- |
| Net sub-2 ms difference in any clock hour of the run (by chunk start) | at most 10 ms | Observed worst hour on Regiurn: under 1 ms net. The earlier smoke's positive-only rate was 3.6 ms per hour, so 10 ms is about 3x that. A steady 0.5 ms loss per 5 s chunk would be 360 ms per hour and fail at once. At most 80 ms can hide across 8 hours |
| Net sub-2 ms difference over the whole run | at most 100 ms | Same figure as the old budget; about 0.0003% of 8 hours |
| Net shortfall, timeline minus summed chunk lengths | at most 100 ms (was 1.5 s) | Observed 9 to 23 ms across the smoke and both 8-hour tracks. Tighter than before, so a net loss cannot hide in the 1.5 s slack. The "timeline covers the run" check keeps its own 1.5 s slack |

Absolute values are used for the first two limits, so a large net overlap (duplicated audio) also fails.

## What this rule cannot do

It cannot tell timestamp jitter from a real sample loss that is matched by a real duplicate of the same size within an hour: only the net shortfall bounds that. The three numbers (10 ms, 100 ms, 100 ms) come from three runs and one rule of thumb, not from a measured distribution. Gaps of 2 ms or more are never netted away.

## Code

`scripts/long-run/guards.mjs` (`scanGaps` returns positive, negative, net and worst-hour net) and `scripts/long-run/overnight.mjs` (limits and report line). Tests in `scripts/long-run-guards.test.mjs`: cancelling jitter passes, a real accumulating loss fails, one 8 ms gap fails, a marked gap is still reported.
