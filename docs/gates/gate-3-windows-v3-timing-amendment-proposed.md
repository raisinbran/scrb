# Proposed Protocol v3 timing amendment

Implements the owner's November 8 approval of the constructed-unit method with the independent corrections supplied in the assignment. This separate amendment is proposed for review; the original Protocol v3 is not edited. The test manifest remains **NOT_FROZEN** and no physical run is authorized here.

## Section 1, line 36: replace timing-method wording

Replace the timing-method sentences in the **Start point** bullet of section 1 (not section 2) with:

> Reference utterance timing comes from constructed sample offsets and measured source energy, independently of the app's recognition model. Each multi-word utterance consists of exactly one prefix unit containing all words except the last, synthesized once, and one final-word unit synthesized alone. A one-word utterance has only its final-word unit. No TTS engine bookmark, AudioPosition or scale factor is used. Each unit is measured in 5 ms RMS frames at max(128 PCM16 amplitude, 3% of unit-peak RMS) and at a second threshold of amplitude 184 (approximately −45 dBFS). Source approval fails if there is no active frame, an edge is clipped, crop padding is invalid, onset spread exceeds 25 ms or offset spread exceeds 100 ms (see the 2026-11-09 revision). Crop from the earliest onset minus 20 ms to the latest offset plus 30 ms, then join using exact sample counts. Prefix-internal word boundaries are not claimed.
>
> The primary reference endpoint is the final-word unit's acoustic energy offset in the joined source. Report its second-threshold spread and 5 ms frame resolution; the conservative boundary uncertainty is the offset spread plus the frame resolution. The `crop_end_bound` is the start of inserted silence after the cropped final word. It is a secondary sensitivity bound only, not a detector endpoint. Neither bound makes this retest score comparable with the frozen November 7 73/77 detector-end result; that result and scoring rule remain unchanged.
>
> Effective near-silence at each within-utterance join equals trailing crop silence plus inserted zeros plus leading crop silence, all converted to seconds at the source sample rate. Require it strictly below the candidate VAD silence split minus 20 ms. The pinned candidate's `whisper.ts` line 144 passes `-vsd 300`, so the limit is strictly below 280 ms. Default inserted zeros are 40 ms (960 source samples at 24 kHz). The 16 kHz live-engine rate does not change that seconds-based comparison. Joined-file verification checks exact zeros, segment hashes, sample partitions and join arithmetic. It is an arithmetic/consistency check, not independent acoustic ground truth. Waveform spot-checking, second-threshold spread and listen-through are still required.

## Section 2: add eligibility caveat

> All generated annotations have status UNFROZEN until arithmetic/consistency verification, waveform spot-check and listen-through pass. Constructed speech may alter prosody, VAD segmentation and recognition behavior relative to natural speech. An anomaly localized to VAD or recognition must carry this constructed-speech caveat. A clean constructed-speech result does not clear the November 7 natural-speech failure. No output-driven denominator change is permitted.

## Freeze Manifest item 3: replace annotation inventory wording

> Both annotation files with eligibility flags, primary acoustic endpoints, secondary `crop_end_bound` sensitivity values, exact sample indices, second-threshold spread, 5 ms resolution and stated uncertainty. Include the timing basis, unit manifest, measurement configuration/script version, joined-file manifests and arithmetic/consistency verification. Record each artifact's SHA-256 and both source WAV hashes. Prefix units and final-word units must be traceable to original unit WAV hashes and exact cropped segments.

**Unchanged:** D2 capture-equivalence and the Layer A/B/C rules remain in force. Layer C cannot assume one reference utterance equals one event: `livePcmEngine.ts` limits speech processing spans to 4,000 ms, so an utterance may generate several diagnostic trace events. Preserve INCONCLUSIVE when an unambiguous chain is unavailable.

## Revision 2026-11-09: acoustic-end spread policy

The owner approved ChatGPT's Option B (CONDITIONAL review) on 2026-11-08 as the source-validity rule, replacing the 25 ms hard limit on offsets. This supersedes the 25 ms limit, the single-offset crop and the single-endpoint latency wording above where they differ. Protocol v3 is not edited. Rule, verbatim:

> Measure every unit using the existing primary and secondary energy thresholds and 5 ms frames, without changing either threshold. Require onset spread <=25 ms and offset spread <=100 ms. Reject any unit with no active speech, a clipped boundary, invalid crop padding or a spread exceeding its applicable limit. Preserve both threshold-supported edges when cropping: begin 20 ms before the earliest onset and end 30 ms after the latest offset. For each final word, define the earliest plausible acoustic end as the earlier measured offset minus 5 ms, and the latest plausible acoustic end as the later measured offset plus 5 ms. Record both endpoints and their spread for every utterance. Layer A conservative latency uses the earliest acoustic end and the latest plausible visible-publication time. Layer A best-case latency uses the latest acoustic end and the earliest plausible visible-publication time. Apply these bounds to both the three-second median and six-second coverage tests. Preserve Protocol v3's PASS/FAIL/INCONCLUSIVE rules. Layer B uses the same bounds. No threshold adjustment, source replacement, selective endpoint choice or change to the frozen November 7 result is permitted.

The 100 ms is a maximum permitted ambiguity, not a claim that the endpoint is known to 100 ms. Waveform spot-check and listen-through remain required. Constructed-speech results do not supersede the historical 73/77 detector-end result. The joined-file checks remain arithmetic/consistency checks, not independent acoustic ground truth.

## Revision 2026-11-09 (b): meeting-track speaking rate

The meeting track is rendered at the voice's default rate and the microphone track keeps a `-15%` prosody rate, each recorded per unit in the manifest. This follows the first constructed render measuring 118.14 wpm on the meeting track against the unchanged 130-170 wpm check. The check, the short and long duration rules and Protocol v3 are not changed. The earlier render is retained as evidence.

## Revision 2026-11-09 (c): calibrated speaking rates

The microphone track is rendered at the voice's default rate and the meeting track at a `+30%` prosody rate (approved by the owner on 2026-11-08 after the pre-flight; the `+20%` version failed the half-effect check at a projected 129.6 wpm), each recorded per unit in the manifest. The `+30%` rate is untested in the actual speech engine; only the application-side regex check has accepted it. The first constructed render (`-15%`) measured the meeting track at 118.14 wpm and the second (`default`) at 127.93 wpm against the unchanged 130-170 wpm check. The rate is a projection-based calibration (two-point extrapolation for Zira, one-point cross-voice estimate for David) and will be verified only by measuring the render. The in-window planned gap budget now accounts for crop padding; the 0.5 s rule is unchanged. The earlier renders are retained as evidence. Protocol v3 is not edited.

## Revision 2026-11-09 (d): ratified operating criteria and r3 result

**Ratification (owner, 2026-11-08, diagnostic retest only).** The owner ratified the declared operating criteria for this diagnostic retest: speaking rate 130-170 wpm and short-utterance fraction 35-45%, which are implementation interpretations of "about 150 wpm" and "about 40% shorts", and the final rates (microphone `default`, meeting `+30%`). This approves existing criteria. It is not permission to change any criterion after seeing latency results. No recording, freeze, merge or threshold change is authorized by it.

**r3 render and measurement.** The `+30%` meeting rate is no longer untested: the owner rendered it (r3) and it was measured offline. All 52 units were accepted (largest onset spread 15 ms, largest offset spread 75 ms). Assembled speaking rate: microphone 142.83 wpm, meeting 164.26 wpm, both inside 130-170. The meeting rate is far above the 147 wpm projection (see A-026), so owner listening to the fast meeting utterances remains required. Short fraction is 26/65 on the microphone track and 30/75 on the meeting track (40.0% each); each track has 8 shorts inside the 170-245 s window. Joined-file arithmetic verification passed on both tracks. It is a consistency check, not independent acoustic ground truth. A 12-clip waveform spot-check found no clipped crop edges. Annotations stay UNFROZEN.

**Not unchanged from the original v3.** The timing method (constructed units with measured energy edges) and the 100 ms offset-spread policy (onset spread <= 25 ms, offset spread <= 100 ms, crop and bound rules above) were revised and approved by the owner before r3 was rendered. They are not the original v3 text. The 73/77 historical result is unchanged: it was scored under the original frozen detector-end rule and none of these revisions touch it.
