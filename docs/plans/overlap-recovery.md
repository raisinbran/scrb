# Overlap recovery: plan

**Status:** draft for owner approval. Plan only; no code changed. Independent review pending.

Phase 4 task (Development Plan): find where overlapped speech is lost between the pyannote segmentation 3.0 output and the final labels, then say what is worth changing. All numbers are ES2004a (public AMI), one meeting, one model build (int8), 10 ms frames, reference overlap = at least 2 reference speakers, away from the scorer's 0.25 s collars (**83.02 s**; reference denominator 722.32 speaker-seconds). Final-pass DER 20.32% (miss 17.23%, confusion 2.15%); target 25% or less.

## 1. What the three investigations measured

| Investigation | What it did | Result |
| --- | --- | --- |
| Raw-output measurement (retained in `/Users/brandonchen/Documents/ChatGPT/srcb/live-remeasure-after-96-97-20261111/overlap-loss-diagnosis.md`, not in git) | Counted speakers per frame in the cached raw sidecar output and in the final labels, inside the 83.02 s of reference overlap | Raw: 0 / 1 / 2+ speakers for 5.42 / 44.60 / 33.00 s. Final: 5.42 / 53.56 / 24.04 s. Merge costs 8.96 s. 10.80 s of raw 2+ output is false overlap in solo speech |
| Code trace ([overlap-loss-trace-20261112.md](../research/overlap-loss-trace-20261112.md)) | Read the sidecar and the vendored sherpa source, no run | Sidecar passes every segment through, overlapping ones included. Sherpa keeps two speakers in a frame only if the mean speaker count over covering chunks is 1.5 or more (`ComputeSpeakersPerFrame`, `+ 0.5`). `min_duration_on` 0.3 s drops short single-speaker segments |
| Model experiment ([overlap-loss-experiment-20261112.md](../research/overlap-loss-experiment-20261112.md)) | Ran the int8 model over ES2004a, rebuilt per-frame counts (matches the raw output within 0.1 s) | Of the 44.66 s one-speaker overlap: mean count at least 1.5 for 0.64 s, 1.3 for 4.44 s, 1.1 for 16.46 s; **below 1.0 for 23.29 s (52%)**. Of 5.45 s with no raw speaker, 5.27 s average below 0.5 |

## 2. Where overlapped speech is lost

Of the 83.02 s: 33.00 s survive raw output, 24.04 s survive the final labels.

1. **The model does not signal a second speaker (about 50 s, the main loss).** 44.60 s are one speaker and 5.42 s none in raw output. In 52% of the one-speaker frames the model's mean count is below 1.0, and 5.27 of the 5.45 s of no-speaker frames below 0.5, so no threshold can recover them. Only 4.4 s (10%) sit at 1.3 or more. Evidence: experiment note, validated against the raw output.
2. **Sherpa's `+ 0.5` count rule (at most about 4 s).** Lowering the bar from 1.5 to 1.3 adds at most 4.44 s of 2-speaker frames, before clustering, and about 2 s of that in runs of 0.3 s or less that the minimum-duration filter may drop.
3. **Our final merge (8.96 s, measured).** `decideSpeakers` (`packages/transcription/src/finalPass.ts:178-186`) maps 13 raw clusters to 4 speakers; two simultaneous spans that land on one speaker score as one voice. Intended: it fixes over-splitting. Whether the 8.96 s are one person over-split or two people wrongly merged is **not measured**.
4. **One label per word (`speakers.ts:312-342`)** affects the transcript only, not DER.

Not causes: `min_duration_off`, the 1.5 s `embeddingSpans` pick, the sidecar output code, post-processing of spans.

## 3. Smallest changes, ranked

| # | Change | Best-case gain (DER points of 722.32 s) | Cost and risk | Needs from owner |
| --- | --- | --- | --- | --- |
| 1 | Do nothing; keep human correction of overlap (owner decision 2026-11-11) | 0 | None | Nothing |
| 2 | Sherpa count rule: `+ 0.5` to `+ 0.7` in `offline-speaker-diarization-pyannote-impl.h:424` | at most 0.6 (4.44 s), minus new false alarm and confusion; raw output already has 10.80 s of false overlap | Patch to vendored sherpa and a sidecar rebuild on both platforms, which is native build work; risk to the 2.15% confusion | Approval of the patch; no contract change |
| 3 | Keep overlapping clusters apart at the final merge (`finalPass.ts:178-186`) | at most 1.2 (8.96 s), only if those spans are really two different people | Likely raises confusion where one person is over-split; not measured | Nothing for the measurement; approval to change relabel |
| 4 | New overlap-aware model (DiariZen or similar) | Unknown; the only route that could address the roughly 50 s model loss | Large; models are not committed; licence, CPU and size unverified | Already deferred to V1 or V1.1 |

Changes 2 and 3 together cannot exceed about 1.8 points, and the model loss (about 6.9 points of the denominator) is out of reach for either. Neither needs a `packages/contracts/` change.

## 4. Offline measurement before any app change

Silent, ES2004a only, no app launch, nothing committed beyond the notes. Same venv and scripts as the experiment (`scripts/research/overlap_count_experiment.py`).

- **A. False-overlap risk of change 2 (about 5 min of run time, under the 20-minute line).** Reuse the model output to count how many reference solo-speech and non-speech frames reach a mean count of 1.3 or more. Decision rule: if those exceed the 4.44 s of true overlap gained, stop.
- **B. Ceiling of change 3 (under 1 min, cached data).** Rescore the cached raw clusters (`cache-ES2004a-1.json`) with each raw cluster mapped to the reference speaker it overlaps most, and compare with 24.04 s of retained overlap. Shows how much of the 8.96 s is a wrong merge and not an over-split voice.
- **C. Only if A and B both show a gain of 1 point or more:** one full sherpa diarizer run on ES2004a with the patched count rule, then the standard scorer. A diarization of the full meeting is not yet timed; estimated at under 10 minutes, to be confirmed before starting. Any step expected to exceed 20 minutes needs owner approval first.

## 5. Recommendation

Do not change the product now. The overlap loss is mostly the segmentation model not signalling a second speaker (about 50 of 83 s), which no rounding or merge change can reverse. The count-rule patch (at most about 0.6 point, with a real false-alarm cost) and the merge change (at most 1.2 points, likely worse confusion) are small against DER already inside the 25% target, and change 2 adds native build work on two platforms. Recommended:

1. Close the Phase 4 task with this finding: overlap is lost mainly in the model, then in the intended final merge; the sidecar and our post-processing do not drop it.
2. Optionally run measurements A and B (about 6 minutes total, owner OK not required, both under 20 minutes) so the two small changes are rejected on evidence rather than estimate.
3. Revisit a new overlap-aware model at V1 or V1.1, as already decided.

Related, separate: ordering of overlapped speech in the transcript is planned in `docs/plans/overlap-chronological-order.md` (open PR).
