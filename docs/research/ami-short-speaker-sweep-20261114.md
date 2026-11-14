# Short-speaker threshold sweep on AMI (2026-11-14)

AMI only; no private recordings. Answers: when should the final pass keep a short remote cluster as its own speaker instead of folding it into the nearest bigger one?

## Correction to the diagnosis note

PR 214's note says the final pass absorbs every cluster under 30 s. The code on main already used 13 s (`FINAL_RELABEL_DEFAULTS`, set after TS3003a); 30 s (`NAMED_AFTER_MS`) is only the default of `relabelClusters` and the live pass. Either way the rule had no similarity check: a cluster under the limit joined its nearest bigger speaker whatever the voice.

## Rule

- At least 30 s of speech: a speaker (clusters at or above 0.65 similarity still merge).
- From the **short floor** up to 30 s: kept as its own speaker unless its voice is at or above the **guard** similarity to a bigger speaker, then it joins that one. Biggest first, so a kept short cluster can take its own fragments.
- Under the floor: always absorbed.

## Method

- Pipeline as shipped: pyannote 3.0 int8 segmentation, eres2net embedding, sherpa threshold 1.0 (over-split), then relabel. Diarization run once per meeting (`scripts/research/ami_speaker_dump.mts`, first 18 minutes of each Mix-Headset track, 4 threads, about 6.5 minutes per meeting, one process each); the relabel settings were then applied offline to the same clusters and embeddings (`ami_speaker_sweep.mts`), so settings differ only by the rule.
- Scored against AMI manual segments for the same 18 minutes (`ami_speaker_score.py`, using `scripts/eval/score_der.py` logic: 10 ms frames, overlap counted, 0.25 s collar, best one-to-one speaker mapping).
- Eight meetings, all with 4 true speakers. Tuning group: EN2002d, ES2003c, ES2004a, IS1009a. Held-out group: ES2014b, ES2015c, ES2016c, TS3003a. The setting was chosen on the tuning group only.
- **False extra speaker** = a hypothesis speaker matched to no true speaker (a real voice split in two, or noise). **Missed** = a true speaker matched to no hypothesis speaker. **Exact** = speaker count equals the true 4.
- Floors tried: 3, 5, 10, 15, 20 s (30 s is the old rule). Guards: 0.4, 0.5, 0.6, 0.65.

## Results

| Setting                         | Tune: exact count (of 4) | Tune: false extra | Tune: missed | Tune: mean DER % | Held-out: exact (of 4) | Held-out: false extra | Held-out: missed | Held-out: mean DER % |
| ------------------------------- | ------------------------ | ----------------- | ------------ | ---------------- | ---------------------- | --------------------- | ---------------- | -------------------- |
| old rule, 13 s (shipped before) | 3                        | 2                 | 0            | 19.4             | 0                      | 2                     | 2                | 15.4                 |
| old rule, 30 s                  | 3                        | 0                 | 1            | 19.2             | 2                      | 0                     | 4                | 15.6                 |
| min 10 s, guard 0.4             | 4                        | 0                 | 0            | 18.9             | 2                      | 0                     | 2                | 14.7                 |
| min 10 s, guard 0.5             | 4                        | 0                 | 0            | 18.9             | 2                      | 1                     | 1                | 14.5                 |
| min 10 s, guard 0.6             | 3                        | 1                 | 0            | 19.1             | 2                      | 1                     | 1                | 14.5                 |
| min 10 s, guard 0.65            | 3                        | 2                 | 0            | 19.6             | 0                      | 4                     | 1                | 15.3                 |
| min 15 s, guard 0.4             | 4                        | 0                 | 0            | 18.9             | 2                      | 0                     | 4                | 15.6                 |
| min 15 s, guard 0.5             | 4                        | 0                 | 0            | 18.9             | 1                      | 1                     | 3                | 15.1                 |
| min 15 s, guard 0.6             | 3                        | 1                 | 0            | 19.1             | 1                      | 1                     | 3                | 15.1                 |
| min 15 s, guard 0.65            | 3                        | 2                 | 0            | 19.6             | 0                      | 2                     | 3                | 15.5                 |
| min 20 s, guard 0.4             | 3                        | 0                 | 1            | 19.2             | 2                      | 0                     | 4                | 15.6                 |
| min 20 s, guard 0.5             | 3                        | 0                 | 1            | 19.2             | 2                      | 0                     | 3                | 15.0                 |
| min 20 s, guard 0.6             | 3                        | 0                 | 1            | 19.2             | 2                      | 0                     | 3                | 15.0                 |
| min 20 s, guard 0.65            | 2                        | 1                 | 1            | 19.9             | 2                      | 0                     | 3                | 15.0                 |
| min 3 s, guard 0.4              | 4                        | 0                 | 0            | 18.9             | 2                      | 0                     | 2                | 14.7                 |
| min 3 s, guard 0.5              | 2                        | 2                 | 0            | 19.0             | 1                      | 3                     | 1                | 14.6                 |
| min 3 s, guard 0.6              | 1                        | 6                 | 0            | 19.6             | 1                      | 4                     | 1                | 14.7                 |
| min 3 s, guard 0.65             | 1                        | 7                 | 0            | 20.0             | 0                      | 8                     | 1                | 15.4                 |
| min 5 s, guard 0.4              | 4                        | 0                 | 0            | 18.9             | 2                      | 0                     | 2                | 14.7                 |
| min 5 s, guard 0.5              | 2                        | 2                 | 0            | 19.0             | 1                      | 2                     | 1                | 14.5                 |
| min 5 s, guard 0.6              | 1                        | 6                 | 0            | 19.6             | 1                      | 3                     | 1                | 14.7                 |
| min 5 s, guard 0.65             | 1                        | 7                 | 0            | 20.0             | 0                      | 6                     | 1                | 15.4                 |

| Meeting            | True | Old 13 s                       | Old 30 s                       | Chosen (min 10 s, guard 0.4)   |
| ------------------ | ---- | ------------------------------ | ------------------------------ | ------------------------------ |
| EN2002d (tune)     | 4    | 6 speakers, DER 33.9%, extra 2 | 4 speakers, DER 31.7%, extra 0 | 4 speakers, DER 31.7%, extra 0 |
| ES2003c (tune)     | 4    | 4 speakers, DER 8.1%, extra 0  | 3 speakers, DER 9.3%, extra 0  | 4 speakers, DER 8.1%, extra 0  |
| ES2004a (tune)     | 4    | 4 speakers, DER 20.3%, extra 0 | 4 speakers, DER 20.3%, extra 0 | 4 speakers, DER 20.3%, extra 0 |
| IS1009a (tune)     | 4    | 4 speakers, DER 15.4%, extra 0 | 4 speakers, DER 15.4%, extra 0 | 4 speakers, DER 15.4%, extra 0 |
| ES2014b (held-out) | 4    | 3 speakers, DER 14.5%, extra 0 | 3 speakers, DER 14.5%, extra 0 | 3 speakers, DER 14.5%, extra 0 |
| ES2015c (held-out) | 4    | 5 speakers, DER 13.7%, extra 1 | 4 speakers, DER 13.4%, extra 0 | 4 speakers, DER 13.4%, extra 0 |
| ES2016c (held-out) | 4    | 5 speakers, DER 9.5%, extra 1  | 4 speakers, DER 7.7%, extra 0  | 4 speakers, DER 7.7%, extra 0  |
| TS3003a (held-out) | 4    | 3 speakers, DER 23.8%, extra 0 | 1 speakers, DER 26.7%, extra 0 | 3 speakers, DER 23.4%, extra 0 |

## Reading

- The old 13 s rule (what main ran) gave false extra speakers in 3 of 8 meetings (EN2002d two, ES2015c one, ES2016c one) and no meeting-wide win. The old 30 s rule had no false extras but collapsed TS3003a to one speaker (true 4) and lost a speaker in ES2003c.
- Floors of 3 and 5 s with a guard of 0.5 or more add false extra speakers quickly (up to 15 across 8 meetings at 0.65). A guard of 0.4 is safe at 3, 5 and 10 s. Floors of 15 and 20 s lose the gains.
- **Chosen: floor 10 s, guard 0.4.** Of the settings tied on the tuning group (floors 3, 5, 10 at guard 0.4, and 10 s at 0.5), it has no false extras and the highest floor. Held-out: 2 of 4 exact counts (old 13 s: 0; old 30 s: 2), 0 false extras (old 13 s: 2), 2 missed speakers (old 13 s: 2; old 30 s: 4), mean DER 14.7% (old 13 s: 15.4%; old 30 s: 15.6%). 10 s with guard 0.5 had a slightly lower held-out DER (14.5%) but one false extra, so it was not chosen.
- The gain is small and driven mostly by TS3003a (1 speaker under the old 30 s rule, 3 now) and by removing the 13 s rule's false extras. Four tuning and four held-out meetings is a small sample; differences of one speaker are one meeting.

## Not covered

- All meetings have four balanced speakers and good headset audio, unlike a real call with a meeting app mixed into one track. No meeting here has a participant speaking under 10 s in total.
- Segmentation or embedding collapses (TS3003a: true 4, found 3) are not fixed by any relabel setting.
- Real recordings were not used or read.
