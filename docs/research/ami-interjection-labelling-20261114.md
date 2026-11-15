# Interjection labelling on AMI, three meetings (2026-11-14)

AMI public data only; no private recordings. This is steps 1 to 3 of "How to measure on AMI" in `docs/plans/overlap-chronological-order.md`, run on **three** of the eight meetings (ES2004a, IS1009a, TS3003a). The other five (EN2002d, ES2003c, ES2014b, ES2015c, ES2016c) were not fetched or run. The research question: how often does the final pass put the wrong speaker on a short interjection?

## Method

- Audio: first 18 minutes (1080 s) of each Mix-Headset track, fetched with `scripts/dev-assets.sh ami` (SHA-256 checked) together with `ami_public_manual_1.6.2.zip`. Nothing from AMI is in Git.
- Diarization: `scripts/research/ami_speaker_dump.mts` (pyannote 3.0 int8 segmentation, eres2net embedding, sherpa threshold 1.0, 4 threads), one process per meeting. Hypotheses use the shipped relabel setting (`RELABEL_DEFAULTS`: 30 s speaker, 10 s short floor, guard 0.4), i.e. the `m10_g0.4` config of `ami_speaker_sweep.mts`.
- Interjection (`scripts/research/ami_interjection_scores.py`): a reference segment by speaker B shorter than 4 s whose span lies inside, or touches within 0.25 s, another speaker A's talk run (A's reference segments merged across gaps of 1.0 s or less). **Overlapped** = A has reference speech on at least one frame of it; otherwise it sits in a pause of A's run. Length buckets: under 0.5, 0.5-1, 1-2, 2-4 s.
- Score: the fraction of the interjection's duration (10 ms frames, no scoring collar) in which the hypothesis carries the final speaker that the best one-to-one mapping assigns to B. The mapping is computed over the whole clip with the 0.25 s collar, as in `ami_speaker_score.py`.

## Results (three meetings, 18 minutes each, pooled)

| Length | Overlapped: count | Overlapped: seconds | Overlapped: labelled with the correct final speaker | Not overlapped: count | Not overlapped: seconds | Not overlapped: correct |
| --- | --- | --- | --- | --- | --- | --- |
| under 0.5 s | 66 | 26.1 | 15.8% | 1 | 0.3 | 0.0% |
| 0.5-1 s | 145 | 103.1 | 14.9% | 2 | 1.6 | 0.0% |
| 1-2 s | 95 | 131.4 | 10.5% | 0 | 0.0 | n/a |
| 2-4 s | 34 | 89.1 | 9.8% | 0 | 0.0 | n/a |

Per meeting (overlapped interjections only; fraction of duration correct):

| Meeting | under 0.5 s | 0.5-1 s | 1-2 s | 2-4 s |
| --- | --- | --- | --- | --- |
| ES2004a | 18 / 11.4% | 69 / 13.1% | 48 / 8.4% | 13 / 13.5% |
| IS1009a | 30 / 27.1% | 44 / 27.3% | 24 / 16.7% | 8 / 15.3% |
| TS3003a | 18 / 0.0% | 32 / 2.7% | 23 / 8.9% | 13 / 3.2% |

(count / correct fraction). The few not-overlapped interjections are 3 in total (IS1009a 2, TS3003a 1), all labelled wrongly.

**Almost every interjection is overlapped by this definition.** AMI manual segments are phrase-level spans without pauses inside a speaker's talk, so another speaker's segment nearly always covers the interjection's frames. The "not overlapped" rows hold 3 interjections and support no conclusion.

## Wall time and machine

Regiurn (Windows 11 Home, i7-14700K, 32 GB, RTX 3080 12 GB; the sherpa sidecar runs on the CPU, 4 threads). Time covers the ffmpeg trim, model load, diarization and span embedding for 18 minutes of audio, one process per meeting:

| Meeting | Wall time |
| --- | --- |
| ES2004a | 105 s |
| IS1009a | 80 s |
| TS3003a | 99 s |

Total 284 s (about 4.7 minutes). The earlier note's figure was about 6.5 minutes per meeting on another machine. The three meeting downloads plus the annotation zip took 24 s (the audio files are 27 to 48 MB, the zip 23 MB).

## Checks and limits

- DER at the shipped setting (same scorer as the sweep note): ES2004a 21.3% (note: 20.3%), IS1009a 15.3% (15.4%), TS3003a 23.4% (23.4%). ES2004a differs by 1.0 percentage point from the earlier note; the cause is unknown (a different machine and run).
- Speaker counts: ES2004a 4 of 4, IS1009a 4 of 4, TS3003a 3 of 4 (one missed), matching the sweep note.
- Three meetings of the eight, first 18 minutes each, so these are not representative of the whole corpus, and an interjection is scored by frames of the mixed headset track, not by words.
- The low correct fractions mean the final pass usually gives an overlapped interjection frame only the main speaker's label. Whether that is acceptable for the "wrong name" decision in the plan is for the owner and review.
- Not independently reviewed.

## Files

`scripts/research/ami_interjection_scores.py` (new). Dumps, hypotheses and audio stay outside Git.
