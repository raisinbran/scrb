# Overlap-loss experiment: does the model signal a second speaker? (2026-11-12)

Offline, ES2004a (AMI) only, no audio played, no product code changed. Follow-up to [overlap-loss-trace-20261112.md](overlap-loss-trace-20261112.md). Script: [scripts/research/overlap_count_experiment.py](../../scripts/research/overlap_count_experiment.py) (onnxruntime 1.31.1, numpy 2.5.4 in `~/scrb-dev-assets/tools/venv`; run 16 s of model time, about 5 min of work in all).

## Method

- Model: `sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx`; 10 s windows, 1 s shift (sherpa default ratio 0.1), 1041 chunks, powerset to 3-speaker multilabel, per-frame count = mean over covering chunks (`ComputeSpeakersPerFrame` without the final `+ 0.5`). Frame time = `frame * 270/16000 + 0.031` s, mapped to a 10 ms grid.
- Reference overlap = at least 2 reference speakers in `reference-ES2004a.rttm`, away from 0.25 s collars around every reference segment boundary. Raw sidecar speaker counts come from the retained `cache-ES2004a-1.json` (threshold 1.0).
- Sherpa's rule makes a frame 2-speaker when mean + 0.5 reaches 2, i.e. **mean >= 1.5**. A "threshold t" below means the frame would be 2-speaker if mean >= t (offset 2 - t). "Without `+ 0.5`" (truncation) needs mean >= 2.0, strictly stricter than 1.5, so it is not tabulated.

## Sanity check (reimplementation vs retained raw output)

| Set | Retained (trace note) | Mine | Agreement |
| --- | --- | --- | --- |
| Reference overlap | 83.02 s | 82.99 s | grid/collar details differ slightly |
| Raw 0 / 1 / 2+ speakers | 5.42 / 44.60 / 33.00 s | 5.45 / 44.66 / 32.88 s | sets match within 0.1 s |
| Raw 2+ set: mean >= 1.5 | n/a | 29.02 of 32.88 s (88%) | mostly agrees; 32.42 s (99%) have mean >= 1.0 |
| Raw 1 set: mean < 1.5 | n/a | 44.02 of 44.66 s (99%) | agrees |

The 12% of 2+ frames below 1.5 is expected: clusters, min-duration merging and `min_duration_off` also shape the raw output, and my per-frame count is not the full pipeline. I treat the reimplementation as validated for the count rule.

## Results: the 44.66 s of reference overlap rendered as one speaker

| Mean count at least | Seconds | Share |
| --- | --- | --- |
| 1.5 (sherpa's current rule) | 0.64 | 1% |
| 1.3 | 4.44 | 10% |
| 1.1 | 16.46 | 37% |
| 1.0 | 21.37 | 48% |
| below 1.0 | 23.29 (0.77 s under 0.5; 22.52 s in 0.5-1.0) | 52% |

The 5.45 s with no raw speaker: 5.27 s have mean < 0.5, none reach 1.0.

Would-be second-speaker runs (consecutive grid frames with mean >= t that touch the one-speaker set), how many are 0.3 s or shorter. These are short runs of elevated mean count, not sherpa's per-speaker segments (sherpa applies its filter after clustering and merging), so they are an estimate only:

| t | Runs | Runs <= 0.3 s | Their seconds inside the one-speaker set |
| --- | --- | --- | --- |
| 1.5 | 13 | 6 | 0.30 |
| 1.3 | 58 | 32 | 2.33 |
| 1.1 | 57 | 12 | 1.28 |
| 1.0 | 71 | 19 | 1.16 |

## What this shows (measured)

- The model itself averages **below one speaker on 52% (23.3 s)** of the frames where sherpa's raw output shows one speaker, and below 1.1 on 63%. In those frames chunks often signal no speaker at all, so even the first speaker is only kept thanks to the `+ 0.5` rounding. A second speaker is not signalled by the model there; a rounding offset cannot recover it.
- Only 4.4 s (10%) reach 1.3 and 0.64 s reach 1.5. Lowering the bar to 1.3 (offset +0.7) could at best add about 4 s of 2-speaker frames, before cluster assignment, and about 2 s of that sits in count runs of 0.3 s or less (a rough estimate of what the minimum-duration filter might then drop).
- A threshold of 1.0 or 1.1 is not a second-speaker test: a mean of 1.0 is what a solid single speaker gives, so 21.37 s at >= 1.0 means mostly "one speaker, consistently", not overlap. Those rows only bound the signal.
- The 0.3 s filter's actual contribution is **unmeasured**. The 2.33 s at t = 1.3 is only a short count-run estimate, not a bound, because the filter acts on clustered, merged segments.

So the loss before raw output is mainly (a): the model does not signal a second speaker. (b) the count rule could recover at most about 4 s (offset +0.7) of the 44.66 s, and only at the cost of more false overlap; (c) the 0.3 s filter is unmeasured; the count-run estimate is about 2 s at t = 1.3.

## What it does not show (guesses and gaps)

- Not the full sherpa pipeline: no clustering, no `min_duration_off` merging, no top-k cluster choice. A frame with mean >= 1.3 would still need a distinct cluster to become a second span.
- It does not measure false overlap added by a lower bar. The raw output already has 10.80 s of false overlap in solo speech (retained note), and the mean-count distribution over reference solo speech was not computed here.
- One meeting, one model (int8 build), 10 ms grid; reference collars and grid choices move totals by about 0.1 s.
- Guess: a count-rule patch looks not worth planning (at most about 4 s, roughly 0.5 point of the 722.32 s reference); the owner's deferral of new models and acceptance of human correction fit the finding.

## Run record

Model Sonnet 5.5 (Claude Code, Mac). Usage via get_usage: five-hour 61% to 62% used, weekly all models 71% to 71% (rounded; shared account, other sessions running); resets 2026-11-12 21:20 UTC and 2026-11-13 13:00 UTC. No failed run. One self-induced slip logged: `numpy` installed without an exact pin.
