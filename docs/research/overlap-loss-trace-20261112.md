# Where overlap is lost in the diarization pipeline: code trace (2026-11-12)

Read-only trace. No product code changed, nothing run, no model, audio or scoring touched. Sherpa source read: local checkout `~/scrb-dev-assets/upstream/sherpa-onnx` (`af2d8d8`), file `sherpa-onnx/csrc/offline-speaker-diarization-pyannote-impl.h` (**P**). Numbers are from the retained evidence notes `miss-diagnosis.md` and `overlap-loss-diagnosis.md` in `/Users/brandonchen/Documents/ChatGPT/srcb/live-remeasure-after-96-97-20261111/` (not in git; ES2004a only).

## Facts

1. **Sherpa returns overlapping segments.** It emits one segment list per cluster, so two clusters speaking at once give two time-overlapping segments (P:`ComputeResult` L722-790). The sidecar writes every segment, sorted by start, with no de-overlap (`packages/transcription/native/scrb-sherpa.cpp:68-90`); `toSegments` passes them through (`sherpa.ts:118-120`).
2. **Overlap enters and leaves sherpa through a count rule.** The powerset head gives a 0/1/2-speaker multilabel per frame (P:`ToMultiLabel` L379, mapping L261-290). Chunks overlap, so each frame is covered by several chunks. `ComputeSpeakersPerFrame` sets the per-frame speaker count to the mean over chunks `+ 0.5`, truncated (P:424). `FinalizeLabels` then keeps that many top clusters per frame (P:697-715). A frame needs a mean count of 1.5 or more to keep two speakers.
3. **Embeddings skip overlap.** `ExcludeOverlap` drops frames with 2 or more speakers before embedding (P:433, 506). This affects identity, not span output.
4. **Sidecar settings.** `min_duration_on 0.3`, `min_duration_off 0.5`, window threshold 1.2 (`scrb-sherpa.cpp:40,187-188`). Final pass runs at threshold 1.0, deliberately over-split (`finalPass.ts:28`), then merges (fact 5). In sherpa these only merge a speaker's own nearby segments (P:`MergeSegments`) and drop short ones (P:`ComputeResult` L783-789 discards any single speaker segment of 0.3 s or less), which can remove a brief second-speaker segment during overlap; how much is unmeasured.
5. **Final merge flattens overlap.** `decideSpeakers` maps raw clusters to final speakers and relabels every raw segment (`finalPass.ts:147-186`, `relabelClusters` in `speakers.ts`). Two raw clusters speaking together that land on one final speaker give two spans with the same label, which score as one voice.
6. **Words get one speaker.** `assignSpeakers` picks the span with the largest overlap (`speakers.ts:312-342`). The live path does the same per word (`meetingDiarizer.ts:196-215`). The DER scorer reads spans, not words, so this loses overlap in the transcript only.
7. **Live path** diarizes windows with the same sidecar and clusters embeddings in `LiveClusterer` (`meetingDiarizer.ts:100-165`, `speakers.ts`). It is untraced beyond that; it also drops spans under 1.5 s before embedding (`meetingDiarizer.ts:133`, per `miss-diagnosis.md`).

Measured (retained evidence, ES2004a, reference overlap away from collars = 83.02 s): raw sidecar output has 2+ speakers for 33.00 s of it and 1 speaker for 44.60 s (0 for 5.42 s). After the final merge, 2+ falls to 24.04 s, so the merge costs 8.96 s. Final-pass raw output already lacks 114.97 s of the 124.48 s missed (92%); the merge explains 9.51 s.

## Stages that can drop or flatten overlap, most likely first

1. **Loss before raw output** (about 50 s: the 44.60 s plus 5.42 s above). Suspects: the model emits one speaker there; the `+ 0.5` rounding (fact 2) discards a second speaker that only some chunks signal; or the 0.3 s minimum-duration filter (fact 4) removes short second-speaker segments (possible, unmeasured). **Guess:** the rule is the cheapest suspect because it is a known pyannote heuristic, but nothing here shows which it is.
2. **Final cluster merge** (8.96 s measured). Intended behavior; removing it would raise confusion. Low value.
3. **One label per word** (transcript only, no DER effect).
4. **Not shown to be causes:** `embeddingSpans` 1.5 s selection, sidecar output code, the clustering threshold (previous work found its usable band narrow).

## Cheapest next experiment (proposal, unverified)

Separate "model never signals a second speaker" from "rounding or the 0.3 s filter drops it" by dumping per-frame segmentation output for ES2004a, then applying the count rule offline and comparing with the reference RTTM (`reference-ES2004a.rttm` in the evidence folder).

- **Inputs:** `~/scrb-dev-assets/models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0` (int8 model already local), the ES2004a AMI fixture wav (location not confirmed by me), the RTTM above. Needs `onnxruntime` and `numpy` in `~/scrb-dev-assets/tools/venv`; neither is installed (checked), so this needs one package install, which is a download and needs owner OK.
- **Method:** run 10 s windows at 1 s shift (about 1000 CPU runs of a small int8 model), rebuild per-frame counts with and without `+ 0.5`, and report, over the 44.60 s one-speaker overlap, how many frames have mean count at or above 1.3, 1.1 and so on. If most sit under 1.0 the model is the limit and a rounding patch will not help; if many sit at 1.3-1.5 a small offset could recover them.
- **Cost estimate (unverified):** about 15 minutes in total (install 2, script 8, run 2-5), under the 20-minute line, so it fits the existing rule, but the package install needs approval. Not a diarizer rerun and no score change. A rounding patch itself would mean rebuilding sherpa and the sidecar, which is a separate planned, reviewed, owner-approved change.

## Unverified

Line numbers for P are from the local checkout, which may differ from the sherpa build the sidecar links against; the build tree is not on this Mac, so the linked version is unconfirmed. I did not re-run any measurement; the table above is carried from the two retained notes. The live path was not traced in depth.
