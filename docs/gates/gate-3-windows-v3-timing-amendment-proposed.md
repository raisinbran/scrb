# Proposed Protocol v3 timing amendment

Implements the owner's November 8 approval of the constructed-unit method with the independent corrections supplied in the assignment. This separate amendment is proposed for review; the original Protocol v3 is not edited. The test manifest remains **NOT_FROZEN** and no physical run is authorized here.

## Section 1, line 36: replace timing-method wording

Replace the timing-method sentences in the **Start point** bullet of section 1 (not section 2) with:

> Reference utterance timing comes from constructed sample offsets and measured source energy, independently of the app's recognition model. Each multi-word utterance consists of exactly one prefix unit containing all words except the last, synthesized once, and one final-word unit synthesized alone. A one-word utterance has only its final-word unit. No TTS engine bookmark, AudioPosition or scale factor is used. Each unit is measured in 5 ms RMS frames at max(128 PCM16 amplitude, 3% of unit-peak RMS) and at a second threshold of amplitude 184 (approximately −45 dBFS). Source approval fails if there is no active frame, an edge is clipped, crop padding is invalid or threshold spread exceeds 25 ms. Crop from onset minus 20 ms to offset plus 30 ms, then join using exact sample counts. Prefix-internal word boundaries are not claimed.
>
> The primary reference endpoint is the final-word unit's acoustic energy offset in the joined source. Report its second-threshold spread and 5 ms frame resolution; the conservative boundary uncertainty is the offset spread plus the frame resolution. The `crop_end_bound` is the start of inserted silence after the cropped final word. It is a secondary sensitivity bound only, not a detector endpoint. Neither bound makes this retest score comparable with the frozen November 7 73/77 detector-end result; that result and scoring rule remain unchanged.
>
> Effective near-silence at each within-utterance join equals trailing crop silence plus inserted zeros plus leading crop silence, all converted to seconds at the source sample rate. Require it strictly below the candidate VAD silence split minus 20 ms. The pinned candidate's `whisper.ts` line 144 passes `-vsd 300`, so the limit is strictly below 280 ms. Default inserted zeros are 40 ms (960 source samples at 24 kHz). The 16 kHz live-engine rate does not change that seconds-based comparison. Joined-file verification checks exact zeros, segment hashes, sample partitions and join arithmetic. It is an arithmetic/consistency check, not independent acoustic ground truth. Waveform spot-checking, second-threshold spread and listen-through are still required.

## Section 2: add eligibility caveat

> All generated annotations have status UNFROZEN until arithmetic/consistency verification, waveform spot-check and listen-through pass. Constructed speech may alter prosody, VAD segmentation and recognition behavior relative to natural speech. An anomaly localized to VAD or recognition must carry this constructed-speech caveat. A clean constructed-speech result does not clear the November 7 natural-speech failure. No output-driven denominator change is permitted.

## Freeze Manifest item 3: replace annotation inventory wording

> Both annotation files with eligibility flags, primary acoustic endpoints, secondary `crop_end_bound` sensitivity values, exact sample indices, second-threshold spread, 5 ms resolution and stated uncertainty. Include the timing basis, unit manifest, measurement configuration/script version, joined-file manifests and arithmetic/consistency verification. Record each artifact's SHA-256 and both source WAV hashes. Prefix units and final-word units must be traceable to original unit WAV hashes and exact cropped segments.

**Unchanged:** D2 capture-equivalence and the Layer A/B/C rules remain in force. Layer C cannot assume one reference utterance equals one event: `livePcmEngine.ts` limits speech processing spans to 4,000 ms, so an utterance may generate several diagnostic trace events. Preserve INCONCLUSIVE when an unambiguous chain is unavailable.
