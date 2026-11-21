# AMI remote-speaker threshold 0.8 — prospective paired safety screen (2026-11-20)

**Status: NOT RUN for this expanded study; no production acceptance.** PR #392 keeps
ordinary-app Sherpa threshold at **1.0**. The research-only option compares 1.0
and 0.8 using **public AMI** assets, identical models and relabel settings.

## Existing evidence and limits

The prior W10 PR reports four two-voice windows with dominant-voice alignment at
0.8, three one-voice controls that stayed at one speaker, and one busy ES2004a
counterexample: two output speakers did not align cleanly with four annotated
speakers. Short-speaker merge line was 0.85. These are *limited observations*,
not a validated diarization error rate or proof that 0.8 is safe across real
meetings. Earlier Mac invented-voice examples are not independent public evidence.

## Source-matched expansion

Before seeing candidate results, select **new, nonoverlapping, independently
annotated** public AMI windows from at least six meetings. Suggested research
coverage (not a product release gate): 12 or more windows with at least three
each having one, two, and three-or-more sustained annotated speakers; include
crosstalk, short turns and different acoustics. A sustained reference voice has
at least five annotated speech seconds within the window. Do not cherry-pick
windows where 0.8 already looks good. Keep earlier examples separate.

- Source: locally verified public AMI Mix-Headset WAVs and segment annotations
  in the ann/segments folder. Each window is at most **60 seconds**.
- Freeze a JSON manifest before inference. The known ES2004a excerpt is only
  a formatting example, **not** a proposed held-out test:

      {"windows":[{"meeting":"ES2004a","startSeconds":529,"durationSeconds":45}]}

- For each selected window invoke the existing research runner twice with
  identical source/audio/model inputs. The last CLI argument is 1.0 for baseline
  and 0.8 for candidate, respectively. Use unique previously nonexistent
  off-repository report paths in a private disposable folder named precisely
  MEETING-START-DURATION-t1.json and MEETING-START-DURATION-t08.json.
- Each invocation creates an exclusive scratch parent under SCRB_BIN; generated
  audio and final-pass work directory are inside it. That parent is cleaned even
  after errors, without touching pre-existing sibling folders. Reports are written
  only with no-overwrite semantics. Keep recordings/libraries private.
- Use the established W10 executor method of invoking the existing research
  runner; do not install new tools, download models, or silently patch runtime
  source. Plan setup, both inference passes, scoring and cleanup. **Obtain owner
  permission before any test expected to exceed 20 minutes**. No automatic
  retry of an inconclusive experiment.
- Once all paired reports exist, run:

      node scripts/research/ami_remote_window_compare.mjs MANIFEST.json REPORT_DIR NEW_SUMMARY.json

- Retain the raw paired JSON evidence privately and publish sanitized aggregate
  counts/model basenames only. Never commit raw audio, full transcripts, embeddings
  or private identifiers.

## Interpretation

The paired scorer rejects mismatched source window, commit, audio name,
model basenames, threshold, or short-speaker merge line. Only the research
threshold may vary (1.0 vs 0.8). It summarizes sustained reference voices,
output cluster counts, and label-independent distinct annotated-voice pairs.
A pair counts as distinguishable when both voices have a dominant output
speaker overlapping at least 25% of annotated speech (minimum one second)
and the two dominant IDs differ.

It flags **lost pairwise separation**, **more outputs in a one-voice control**,
and **large multi-voice count expansion** as possible regressions. It reports
per-window and by-cohort counts. Small/incomplete samples yield
INSUFFICIENT_DIVERSE_EVIDENCE; warnings yield REGRESSION_WARNINGS. Even a
complete sample without warnings yields NO_REGRESSION_IN_THIS_SCREEN, never
a claim of universal safety.

These are speaker-label-invariant *screening metrics*, **not DER** or
overlap-aware error rates. AMI speech annotations may overlap, cluster
counts are not definitive false-split evidence, and context length matters.
A production recommendation needs representative long-context DER and
overlap evaluation beyond this screening, plus separate M1 owner acceptance.
Preserve the original busy ES2004a counterexample.

**Current disposition:** Production stays at 1.0. The expanded real-audio
paired results are not yet available from this cloud environment. No new
physical recording or unauthorized >20-minute inference was launched.


## Follow-up review hardening

The runner now emits schema-version 2 reports only from a clean source tree. Paired reports must carry matching SHA-256 values for the source mix, generated window clip, exact annotation bytes, model inputs and tool binaries. Annotation paths are checked as regular files beneath the canonical AMI corpus before reading. These values establish paired-input identity; they do not establish diarization accuracy.

The multi-voice oversplit flag is a screening heuristic: it warns when a candidate emits more speakers than the number of sustained annotated speakers in that window. It does not determine which output labels are correct and is not DER or an M1 acceptance criterion.
