# Gate 8 lost-audio rule: tiered proposal (option B)

Status: PROPOSAL for independent review and owner approval. Written on 2026-11-14 after seeing both Windows 8-hour results, so it must not be used to judge those runs until reviewed. Not yet implemented. The verifier in `scripts/long-run/` (merged in #248) enforces only the "never net 2 ms or more" and frame-count rules today.

## Why tiers

The recorder measures chunk timestamps. Two different things show up there: small timestamp jitter (under 2 ms, no audio missing: every closed chunk has its expected frame count) and real gaps (the helper marks them, `missingCause`). They need different handling.

## Rule

1. **Jitter under 2 ms** (either direction): netted. Provisional limits stay: net within 10 ms in any clock hour and 100 ms over the run, per track. Passing also needs the frame-count evidence from #248; if that is missing the track is INCONCLUSIVE.
2. **Unmarked gap of 2 ms or more:** always FAIL.
3. **Marked gap of 2 ms up to 20 ms:** allowed. The track total of marked gaps must be 100 ms or less per 8 hours. The report lists every one.
4. **Marked gap over 20 ms:** each one is a finding and blocks the gate until it is explained or fixed. It is an open recording bug (Gate 8: "no open recording, data-loss or privacy bugs").
5. **Overlap of 2 ms or more:** always reported as a finding (as in #248), never netted.

## Where the numbers come from

| Number | Basis | Strength |
| --- | --- | --- |
| 2 ms | The helper's own tolerance | From the recorder design |
| 20 ms per gap | Judgement: a gap this short is generally not noticed in speech | Not measured; a listening check was not done |
| 100 ms total per 8 h | Judgement: under 0.0004% of the run | Not measured |
| 10 ms/h and 100 ms/run jitter nets | Existing provisional limits | See below |

Jitter data (`2026-11-14-regiurn-jitter-numbers.md`, `2026-11-14-w10-jitter-numbers.md`): the meeting-track jitter is exactly 0 on both PCs. The microphone is the only noisy track. Worst microphone clock-hour net: Regiurn 0.594 ms, W10 9.334 ms. Whole-run net: Regiurn 4.376 ms, W10 33.923 ms. Largest absolute difference under 2 ms: W10 1.9987 ms. W10 is within 0.7 ms of the hourly limit, so the limit is not obviously loose; the evidence is two PCs and one run each, so no limit here is calibrated.

## What this rule would have said

| Run | Result | Reason |
| --- | --- | --- |
| Regiurn 8 h | Passes the gap tiers | One marked 8 ms meeting gap; microphone jitter nets 0.594 ms/h and 4.4 ms/run |
| BCHEN-W10 8 h | FAIL | Marked gaps over 20 ms on both tracks (at least 20 microphone gaps over 50 ms and 6 meeting gaps over 50 ms; largest 192.6 ms and 210 ms) until the roughly 5-minute stall on that PC is understood and fixed |

Regiurn's Gate 8 recorder result stays FAIL under the verifier as run until this rule is reviewed, approved and implemented. A pass would then be a recorder-only result, not final Gate 8 acceptance (no app, transcription or final pass in that run).

## Limits to be honest about

- The 20 ms and 100 ms numbers are policy judgements, not statistics. More runs can show how often gaps happen; they cannot say what is acceptable.
- Two PCs, one run each. Do not tune the numbers to the next run. Freeze after review, then validate on the next Mac 8-hour run and any W10 rerun after its stall is fixed.
- Frame counts cannot prove waveform continuity across chunks (noted in the #248 review).

## Owner decisions needed

1. Accept 20 ms per marked gap and 100 ms total (or choose others).
2. Confirm that a marked gap over 20 ms counts as an open recording bug at Gate 8.
3. Whether a short listening check of a 20 ms and a 200 ms gap is wanted before the numbers are frozen.

## After approval

One small PR: tier the check in `scripts/long-run/guards.mjs`, add synthetic tests for each tier, and update the report text. No new recording is needed for that.
