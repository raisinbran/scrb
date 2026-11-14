# Outline matcher, slice 1: accuracy report (Level A, AMI)

Date: 2026-11-14. Engine: `packages/outline` (parser, blocks, wording score plus ordered path, pin re-location). Nothing in the app uses it yet. Data: AMI annotations only (126 meetings with topic labels), read from outside git. The owner's recordings were not used.

Full tables (all meetings, and split by label type): `packages/outline/eval/results/slice1-tables.md`. Re-run with `npm run eval -w @scrb/outline` (about 3 s).

## Result in one paragraph

**Level A alone does not meet the plan's ship bar on this test, and is far from it.** On in-order AMI meetings it files about 14% of the dialog (by time) under the right heading with the package defaults, and about 30% with values tuned on AMI. The bar was 70% overall and 90% for "Likely" placements; "Likely" placements were only about 30% correct, so the confidence label does not yet mean anything. The plan's own next step is Level B (a small meaning-based model), which needs the owner's approval of a new model.

## Numbers (all 126 meetings, time-weighted)

| Setting          | Variant         |            Correct overall | Correct where a heading exists | "Likely" correct | Not placed |
| ---------------- | --------------- | -------------------------: | -----------------------------: | ---------------: | ---------: |
| Package defaults | in order        |                      14.0% |                           7.7% |            30.5% |      73.5% |
| Package defaults | jump back       |                      13.8% |                           7.6% |            30.4% |      73.8% |
| Package defaults | heading deleted | 28.8% (mostly by refusing) |                           8.1% |            27.4% |      76.0% |
| Package defaults | extra heading   |                      13.9% |                           7.6% |            30.5% |      74.1% |
| AMI-tuned        | in order        |                      30.0% |                          33.8% |            32.7% |       0.0% |
| AMI-tuned        | jump back       |                      26.4% |                          29.7% |            29.1% |       0.0% |
| AMI-tuned        | heading deleted |                      27.1% |                          39.0% |            29.4% |       0.0% |
| AMI-tuned        | extra heading   |                      29.8% |                          33.5% |            32.8% |       0.0% |

Median error in finding where a topic starts: 42 s (defaults), 126 s (tuned). Almost every meeting is under 70%.

Tuning check: values were searched on the even-numbered meetings only. Average accuracy over the four variants: defaults 16.7% (tuning half) and 18.6% (held-out half); tuned 29.0% and 27.6%. So the gain is real on unseen meetings, but small against the bar. The tuned values place almost everything under the order prior and never leave dialog unplaced, which gives up the plan's "refuse weak matches" and "jump back" behaviours, so they are **not** the package defaults.

## Why it is low, and caveats

- AMI topic labels are short and generic ("marketing expert presentation", "costing", "look and usability"). The words people say in those topics are mostly not the label's words. A real outline with more descriptive headings should do better, but that is not measured here.
- Wording overlap alone cannot see that "headcount" belongs under "Hiring"; this is the gap Level B is meant to close.
- The "Likely" label is mostly granted when neighbouring blocks agree, so it does not track correctness yet. It must not be shown to users as is.
- The transcript is AMI's human-written reference text, not speech-recognition output, so real results can only be worse. Live versus final-pass text was not compared.
- Headings come from the annotation, so the reference is itself judged by one annotator; boundaries are fuzzy by nature.
- Not measured: owner (speaker) bonus on AMI (AMI has no pre-meeting outline with owners; it is covered by an invented-data unit test), real owner meetings (confidential, never used), and a 2-hour transcript beyond a synthetic speed test (500 blocks by 60 items runs well under 2 s).

## What the tests cover

Parser (markdown, numbering, bullets, indentation, owners, limits), blocks (pauses, speaker change, 60 s cut, pins as own blocks), matcher (in order, jump back, skipped heading, off-topic, filler, similar headings, parent context, owner bonus never alone, pins win, deterministic, speed), pin re-location (ids, fingerprint after re-transcription, duplicate-phrase regression: not applied to either copy and flagged `needsRecheck`, unique phrase still found, words changed or removed kept and flagged, time window), and stale-result protection (cancelled, superseded, or revision changed, such as a pin made during a sort, are all discarded).

## Recommendation

Do not build slices 2 to 4 on Level A as it stands. Options for the owner: (1) approve evaluating Level B (about 12 hours plus a model approval) and re-measure with this harness; (2) first try the same harness with richer, user-style headings to see whether the low score is a label problem; (3) stop.

# Level B experiment (sentence vectors)

Experiment only: nothing ships, no contract or UI change. Code is behind an option (`semantic` in `matchOutline` plus `semanticWeight` in the tuning; default 0, so Level A is unchanged). Raw tables come from `eval/run-b.ts`; vectors are cached outside git.

## Model

| Item    | Value                                                                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model   | `Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 8-bit quantised ONNX (`onnx/model_quantized.onnx`); 384-number vectors, 50+ languages including English                                                                                                                                                        |
| Licence | Apache-2.0 (base model `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` is Apache-2.0; the ONNX conversion repo has no separate licence text and points to it). Allows commercial redistribution with a notice. Not legal advice; the chosen model's licence should be re-checked before shipping |
| Source  | https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2 (commit `2c4055b12046f11709e9df2c122e59ffbdc2f900`)                                                                                                                                                                                        |
| Size    | 118,308,126 bytes (about 113 MiB) plus a 17 MB tokenizer file                                                                                                                                                                                                                                                  |
| SHA-256 | `66fc00f5f29afcaff34092e1bdd20008ca3918265a82fb9695a551e510cc4ebc`, equal to the host's published LFS checksum                                                                                                                                                                                                 |
| Stored  | `~/Library/Application Support/scrb-experiments/minilm/` (outside git)                                                                                                                                                                                                                                         |

Runtime: the existing sherpa-onnx is a C++ sidecar for speech and speaker models and has no sentence-embedding entry point, so it cannot run this model. The experiment uses `@huggingface/transformers` 4.3.2 (exact pin, devDependency of `@scrb/outline` only), which brings `onnxruntime-node` 1.30.0 (about 290 MB on disk in `node_modules`, native, per platform). Shipping would add that runtime plus the model to the installer and needs packaging work for Windows and Mac.

## How it works

Each block and each item (with its parent headings, "Parent: Child") is turned into a vector. Score = (1 - w) x wording score + w x rescaled cosine, where rescaled cosine = max(0, cosine - floor) / (1 - floor). The same ordered-path step then runs. Block text is cut at the model's 128-token limit.

## Result (held-out odd-numbered meetings, 64 meetings; weights tuned on the 62 even-numbered)

Average over the four variants:

| Matcher                                |   Correct | Correct where a heading exists | Likely precision | Likely share | Not placed share |
| -------------------------------------- | --------: | -----------------------------: | ---------------: | -----------: | ---------------: |
| Level A, package defaults              |     18.6% |                           8.8% |            31.7% |        16.6% |            71.9% |
| Level A, AMI-tuned                     |     27.6% |                          33.0% |            30.7% |        33.8% |             0.0% |
| Level B alone (weight 1, defaults)     |     17.2% |                           2.8% |            42.7% |         1.7% |            93.7% |
| A+B, tuned from defaults               |     30.4% |                          36.3% |            32.0% |        27.6% |             0.0% |
| **A+B, tuned from the AMI-tuned base** | **31.1%** |                      **37.1%** |        **32.4%** |    **28.1%** |         **0.0%** |

Best A+B values: weight 0.7, cosine floor 0.3 (defaults base) and the Level A tuned values plus weight 0.7 (tuned base). On the tuning half the best A+B scored 34.4%, so the gain holds on unseen meetings.

**Verdict: Level B adds about 3.5 points over tuned Level A (27.6% to 31.1%) and about 12 points over the defaults (18.6% to 30.4%), but it is still far below the 70% accuracy bar, and "Likely" precision (32%) is far below the 90% bar.** The best settings again place everything and never say Not placed, so the plan's "refuse weak matches" behaviour is not met either. Level B alone is poor: AMI topic labels ("costing", "look and usability") are not close in meaning to the dialog in the sentence-vector space, and a 30 to 60 second block mixes several ideas.

## Cost

- Embedding speed on this Mac (CPU, M-series): 31,900 texts (all blocks and items for 126 meetings) in 279 s, about 114 texts per second; 100 long blocks take about 1.1 s. A 2-hour meeting has roughly 500 to 900 blocks, so about 5 to 9 s, one-off per sort (estimate from these rates; no 2-hour meeting was run). Matcher time after embedding is under 1 s for 64 meetings.
- Model load 0.7 s warm; process memory about 850 MB while running (not tuned; the 8-bit model itself is 113 MiB).
- Windows speed was not measured.

## Caveats

- AMI reference headings are short generic labels, the same proxy limit as slice 1. Real outlines with descriptive headings may show a larger gain; that is exactly what tomorrow's real-outline test would show, and it cannot be inferred here.
- One small model was tried. Other models (for example a larger one, or one fine-tuned for topic labels) were not.
- Only the weight and a few thresholds were tuned, as the task asked.

## Recommendation (updated)

Do **not** ship Level B on this evidence: the gain is small (about 3 points over tuned Level A), the bar is missed by a wide margin, and shipping adds a roughly 290 MB native runtime plus a 113 MiB model. Wait for the real-outline test with the owner's samples; if real headings score well with Level A or A+B there, revisit. If real outlines also stay far below 70%, stop pure matching and consider a different approach (for example, the user pins section starts and the matcher only fills between pins, or a local language model, which needs its own plan).
