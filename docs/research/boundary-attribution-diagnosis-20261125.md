# Speaker attribution at turn boundaries (2026-11-25)

Diagnosis only; no production code changed. Numbers only, on AMI (public). The owner's AT meeting was not opened.

## Method

- ES2004a, IS1009a, TS3003a, first 15 min each, run through the shipped final-pass pieces on the Mac: whisper large-v3-turbo q5_0 with VAD (`-ml 1 -sow`), sherpa at `OVERSPLIT_THRESHOLD`, `decideSpeakers` at `mergeLine` 0.70, then `assignSpeakers`.
- Reference: AMI per-speaker word times. Reference speakers are mapped to final speakers one to one, maximising matched words.
- Experiment 1 (isolates the assignment rule and the spans): reference words with reference times go through `assignSpeakers`. Experiment 2 (adds whisper timing): the same words with whisper times, matched by text within 1.5 s.
- "Clean" words are words that overlap no other reference speaker's word. Overlapped speech is ambiguous by construction, so it is left out of the rates below (all 5,576 reference words: 807 wrong, 14.5%, most of it overlapped speech).
- A "boundary" is two consecutive clean words with different reference speakers; "near" is within 1 s of one.

## Results (3 meetings, 4,263 clean words)

| Measure | Value |
| --- | --- |
| Clean words wrongly assigned | 182 (4.3%); per meeting 4.7%, 5.8%, 2.2% |
| Near a boundary (413 words) | 98 wrong, 23.7% |
| Not near a boundary (3,850 words) | 84 wrong, 2.2% |
| Boundaries (174) with at least one wrong word within 1 s | 72, 41% |
| Same, both neighbouring turns 5 or more words (66) | 13, 20% |
| Experiment 1 vs 2 (3,270 matched clean words, not 4,263) | wrong 94 with reference times, 114 with whisper times; 24 flip |
| Distance of a wrong word to the nearest boundary | median 890 ms, p75 1,935, p90 3,370; 12% within 250 ms, 54% within 1 s |

Substantive boundaries (both turns 5 or more words): the previous speaker's span ends a median 553 ms after their last word (p10 17, p90 2,914), and the next speaker's span starts a median 513 ms before their first word (p10 -2,681, p90 0). So spans of two speakers overlap at most hand-offs.

## Which hypothesis explains the 182 wrong words

Exclusive categories, in this order:

| Cause | Words | Share |
| --- | --- | --- |
| (a/c) two spans of different speakers cover the word (overlap, max-overlap rule decides) | 34 | 19% |
| (d) word in a turn of 3 or fewer words (70% of such words are wrong, 54 of 77) | 40 | 22% |
| no span covers the word, nearest span used (57% wrong, 31 of 54) | 31 | 17% |
| other, within 1 s of a boundary | 34 | 19% |
| other, interior (diarization put the stretch with the wrong voice) | 43 | 24% |

- (a) Span edges are imprecise, but shifting word times by 100 or 200 ms in either direction moves the wrong count by within about 5% (178 to 192 vs 182), and assigning by word midpoint gives 186. Edge precision is not recoverable by changing how words are matched.
- (b) Whisper words start a median 130 ms before the reference (p10 -750, p90 +150). Experiments 1 and 2 compared on the 3,270 clean words matched by text (not the 4,263 above): wrong with reference times 94, with whisper times 114 (24 words flip, +0.6 point). Real but small.
- (c) Trimming overlapping different-speaker spans at the midpoint of the overlap: 182 to 176 wrong (3%); boundaries with a wrong word unchanged (72 of 174).
- (d) Short turns are mostly never given their own span by the diarizer, so they take the neighbour's label. `embeddingSpans` (1.5 s minimum) only limits which spans are embedded; it does not remove spans. No relabel rule absorbs spans.

About 60% of errors (short turns, uncovered words, interior) are diarization output, not word assignment. No change to `assignSpeakers` alone can reach them.

## Recommendation (not implemented)

1. Smallest change: none worth shipping alone. Midpoint trimming of overlapping spans is a few lines in `assignSpeakers` or `decideSpeakers`, but removes about 3% of wrong words and none of the boundary hits.
2. Larger effect needs the diarizer: short-turn recall (sherpa minimum on and off durations in `scrb-sherpa`, and whether the over-split threshold yields spans for 1 to 3 word turns). Upper bound: the 40 short-turn words (22% of wrong words) plus all 31 uncovered words (17%), so at most about 39%; unmeasured, and the real gain is lower because the diarizer will not recover every one.
3. Untested idea to evaluate before building: move each speaker change to the nearest inter-word pause of at least 250 ms within 1 s, so a turn never starts or ends mid-phrase. It targets the 34 boundary words left after the other categories.

Test plan: replay the saved spans and words from this run (no re-decode) through each candidate and score with the same script; accept only if clean-word wrong rate falls by at least 0.5 point with no meeting worse; then confirm on 2 further AMI meetings and one real meeting on Regiurn.

## Limits

15 minutes of 3 meetings; AMI words are annotator-aligned, so timing noise adds some error to Experiment 1; the owner's AT meeting is not measured, so the reported symptom is plausible but not confirmed on it. The owner-facing symptom is at sentence level; sentences were not scored.
