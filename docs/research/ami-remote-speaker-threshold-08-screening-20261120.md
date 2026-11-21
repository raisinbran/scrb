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

Adjacent non-system DLLs in each executable folder are part of the tool hash; the report also records operating-system, architecture, and Node runtime identity. Windows system DLLs are deliberately outside this bundle hash.

The runner resolves its own repository root from the script location before checking Git cleanliness and commit identity, so launching it from another directory cannot attest the caller's unrelated repository.

## macOS tooling preflight (research runner portability, November 21)

The research runner can resolve extensionless `ffmpeg`, `ffprobe`,
`scrb-sherpa`, and Whisper executables on Apple Silicon Macs; Windows keeps
its `.exe` paths. No model, tool, annotation or audio is downloaded or
installed by this runner. Both `SCRB_DEV_ASSETS` and `SCRB_BIN` must still
be set explicitly to existing, trusted local roots. Never substitute a default
Documents library, owner's recording, or an arbitrary system `ffmpeg`.

- `SCRB_DEV_ASSETS`: verified public AMI `downloads/ami/*.Mix-Headset.wav`,
  `downloads/ami/ann/segments`, pinned `models/whisper`, pinned
  `models/sherpa-onnx`, and built Whisper programs in
  `upstream/whisper.cpp/build/bin`.
- `SCRB_BIN`: a separately verified Mac runtime `bin` containing extensionless
  `ffmpeg`, `ffprobe` and `scrb-sherpa`. Adjacent and `lib/` Mac
  `.dylib` files enter the per-run bundle hash; source build artifacts outside
  those two directories are not claimed to be a complete dependency closure.
- `SCRB_AMI_SCRATCH` (optional but preferred for packaged/read-only tools):
  an **existing, real, disposable** directory whose exclusively generated child
  receives the clip and final-pass work. The runner rejects symlinked scratch
  roots and removes only its own new child. If omitted, it retains the older
  `SCRB_BIN`-resident scratch behavior.

**Before running any inference**, the assigned Mac agent must verify a clean,
separately authorized checkout of one pinned runner commit; executable/model
presence and expected hashes; available disk space; the six-meeting held-out
manifest; and a bounded runtime estimate. The current M5 dirty/recovery
worktrees are not an appropriate checkout for this runner. A read-only/sandbox
Git metadata failure is not authorization to bypass ACLs or force-checkout.
If any required input cannot be verified, report the exact missing requirement
and **do not start the study**. Under the project policy, obtain fresh approval
before any planned Mac inference/test exceeding 20 minutes. The unrelated
previously authorized W10 hosted test is not transferable.

The paired reporter still requires both thresholds to be executed on the **same
platform, source commit, input hashes, tool hashes and models**. Screens remain
non-DER, and the application default remains **1.0**.
