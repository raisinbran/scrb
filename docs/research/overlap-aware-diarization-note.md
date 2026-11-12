# Overlap-aware diarization: research note (filed, no action)

Date: 2026-11-11. Status: **research only; no action authorized.** Written by Claude Code (Sonnet 5.5) from two web searches; nothing here is verified against our code or audio. Re-verify before acting.

## Why this exists

Mac measurement on full ES2004a (main `cb82b13`): final-pass DER 20.32%, live-span DER 35.41%. Missed speech is 17.23% (final) and 23.88% (live); about 65% and 61% of that miss lies in reference overlap (`miss-diagnosis.md`, retained in the live-remeasure evidence folder). A threshold change cannot recover overlapped speech; only a model that outputs more than one speaker per frame can.

## Findings (secondary sources; unverified for our setup)

- **pyannote segmentation-3.0** has a powerset head that represents up to three simultaneous speakers, so it is overlap-aware by design. An ONNX mirror exists (onnx-community). sherpa-onnx's offline diarization is reported by a third-party blog to use segmentation-3.0 plus CAM++ embeddings. **Checked in code:** our pipeline already loads a pyannote segmentation 3.0 int8 model (`packages/transcription/src/config.ts:20`, `sherpa.ts:32`). **Open question:** whether its overlap output is dropped by the sherpa sidecar or by our clustering, which would make the cheapest path a code change rather than a new model.
- **Vendor-reported AMI DER** (pyannote README, 2025-09, protocol not stated): legacy 3.1 18.8 / community-1 17.0 / precision-2 12.9 on AMI-IHM. Precision-2 is a hosted commercial service and conflicts with our local/private design; treat as out of scope.
- **DiariZen** (WavLM plus end-to-end local segmentation plus pyannote clustering): 13.3% overall DER in an independent 2025 benchmark (arXiv 2509.26177, 0.25 s collar, overlap scored). No ONNX or sherpa-onnx recipe found. WavLM is large; CPU cost and licence unverified.
- AMI has about 16% overlapped speech, and the benchmark found missed speech to be the dominant error across systems, consistent with our result.

## If it is ever pursued (not now)

1. Find where overlap frames are dropped between segmentation 3.0 and the final labels (sherpa sidecar output versus our clustering).
2. Offline score on ES2004a with a candidate overlap-aware path, silently, comparing miss and confusion to 17.23% and 2.15%.
3. Only then consider live use, CPU/RSS budget, model licence and download size, and a plan with independent review and owner approval.

## Sources

- https://arxiv.org/pdf/2109.06483 (overlap-aware online diarization)
- https://arxiv.org/html/2509.26177v1 (Benchmarking Diarization Models)
- https://huggingface.co/OpenASR/pyannote-segmentation-3.0
- https://github.com/pyannote (README AMI table)
- https://openwhispr.com/blog/local-speaker-diarization (third-party; sherpa-onnx pairing)

Owner decision 2026-11-11: DiariZen only if a quick measurement is possible; otherwise leave for V1 or V1.1. No quick route found. Human correction of the few overlap cases is acceptable.
