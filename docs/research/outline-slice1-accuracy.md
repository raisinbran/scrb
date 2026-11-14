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
