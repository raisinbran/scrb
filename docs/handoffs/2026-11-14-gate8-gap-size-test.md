# Gate 8 gap-size test: how much a short audio gap hurts the transcript

Date: 2026-11-14. Data for the lost-audio limits in the gap-rule proposal (PR #251: 20 ms per marked gap, 100 ms total per 8 h). AMI audio only; the owner's recordings were never read.

## Result in one paragraph

A zero-filled gap (time preserved, as a marked gap would be) of **1-15 ms is indistinguishable from the smallest perturbation**: about 15% of variants change a word, mean WER difference 0.3%, never 5 or more words. At **20 ms and above** the effect steps up: 45% change a word, mean 2.8%, 9% change 5 or more words, and it keeps growing to 72% at 200 ms. **Removing** samples (time shifts) is different: it changes the transcript in about two thirds of cases (mean 4.8% WER difference) at **every** size, even 1 ms, so a dropped-but-unmarked gap is harmful regardless of length. Unmodified audio run twice gave identical transcripts in 25 of 25 runs (control), so every change below is caused by the edit; but any 1 ms edit already flips some words, so the usable floor is the 1-15 ms band, not zero.

## Method

- Tools: `whisper-cli` with the final-pass settings from `wholeFileArgs` in `packages/transcription/src/whisper.ts` (large-v3-turbo-q5_0, Silero VAD, `-mc 0`, `-ml 1 -sow`, 4 threads, Metal), one process per variant.
- Clips: AMI Mix-Headset ES2004a, IS1009a, TS3003a (16 kHz mono WAV), three speaker sets.
- Positions: 25 windows of 30 s, window starts on 5 s boundaries, seeded by `random.Random(20261114)`. 21 gap positions are random inside speech (7 per clip, 5-24 s into the window); 4 put the gap start exactly on a 5 s chunk boundary (ES2004a 2, IS1009a 1, TS3003a 1). "Inside speech" means the 500 ms around the gap is above that clip's median level. The same 25 positions are used for every size and mode (paired design).
- Variants: 17 sizes (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 200 ms) x 2 modes (samples replaced by zeros; samples deleted) x 25 positions = 850 runs, plus per position the unmodified window twice (baseline and control) = 900 runs, about 17.7 minutes with 2 workers.
- Comparison: word edit distance (substitutions + deletions + insertions) between each variant and its own unmodified window, lowercase, punctuation removed, divided by the baseline word count (mean 70 words per window). Scripts: `scripts/research/gap-size-test.py`, `scripts/research/gap-size-summary.py`. Raw results are not committed.

## Table (25 positions per row)

| gap ms | zero-filled: changed | mean WER diff % | worst % | worst words | removed: changed | mean % | worst % | worst words |
|---:|---|---:|---:|---:|---|---:|---:|---:|
| 0 (control) | 0/25 (0%) | 0.00 | 0 | 0 | n/a | n/a | n/a | n/a |
| 1 | 3/25 (12%) | 0.25 | 3 | 3 | 13/25 (52%) | 3.00 | 15 | 13 |
| 2 | 3/25 (12%) | 0.29 | 3 | 3 | 14/25 (56%) | 3.46 | 17 | 15 |
| 3 | 5/25 (20%) | 0.30 | 3 | 3 | 18/25 (72%) | 5.48 | 28 | 13 |
| 4 | 4/25 (16%) | 0.30 | 3 | 3 | 16/25 (64%) | 5.53 | 30 | 18 |
| 5 | 4/25 (16%) | 0.35 | 3 | 3 | 16/25 (64%) | 6.20 | 30 | 15 |
| 6 | 4/25 (16%) | 0.35 | 3 | 3 | 18/25 (72%) | 4.95 | 21 | 14 |
| 8 | 3/25 (12%) | 0.19 | 2 | 2 | 18/25 (72%) | 5.37 | 35 | 14 |
| 10 | 5/25 (20%) | 0.50 | 3 | 3 | 14/25 (56%) | 3.73 | 17 | 15 |
| 12 | 2/25 (8%) | 0.16 | 2 | 1 | 16/25 (64%) | 4.62 | 30 | 14 |
| 15 | 4/25 (16%) | 0.26 | 3 | 2 | 21/25 (84%) | 5.68 | 21 | 14 |
| 20 | 9/25 (36%) | 1.67 | 15 | 11 | 16/25 (64%) | 3.28 | 20 | 13 |
| 25 | 8/25 (32%) | 2.18 | 30 | 6 | 19/25 (76%) | 7.23 | 32 | 14 |
| 30 | 10/25 (40%) | 2.76 | 30 | 6 | 16/25 (64%) | 4.64 | 30 | 11 |
| 40 | 11/25 (44%) | 3.05 | 30 | 6 | 13/25 (52%) | 3.18 | 29 | 19 |
| 50 | 9/25 (36%) | 2.63 | 30 | 6 | 19/25 (76%) | 7.13 | 35 | 17 |
| 100 | 13/25 (52%) | 2.11 | 20 | 13 | 17/25 (68%) | 4.99 | 26 | 17 |
| 200 | 18/25 (72%) | 5.11 | 30 | 15 | 18/25 (72%) | 5.87 | 30 | 17 |

"Changed" = any word differs from the unmodified window. Worst case is the single worst variant of the 25.

Pooled (all positions): zero-filled 1-15 ms: 15% changed, mean 0.30%, 0% with 5+ words changed; 20-200 ms: 45% changed, mean 2.79%, 9% with 5+ words; removed 1-15 ms: 66%, mean 4.80%, 26% with 5+ words; removed 20-200 ms: 67%, mean 5.19%, 26%. Words deleted per run: 0.12 (zero 1-15 ms), 0.78 (zero 20-200 ms), 0.96 (removed 1-15 ms).

## Smallest size above the control

The control (unmodified, run twice) changed 0 of 25, so every size is above it. The meaningful comparison is the floor set by the 1 ms edit (12% changed, 0.25%): zero-filled sizes 2-15 ms stay within it (8-20% changed, mean 0.16-0.50%, worst 1-3 words). **The first size clearly above the floor is 20 ms** (36% changed, mean 1.67%, worst 11 words, 22 words deleted across 25 runs, against 1-4 for every size from 1 to 15 ms). Zero-filled 3 ms and 10 ms reach 20% individually, which is within the sampling spread of 25 runs (one run is 4%). Removal has no such floor: it is high at every size.

## Caveats

- AMI is not the owner's meetings: headset-mix audio, different rooms, no echo from a speaker output.
- 25 positions and 3 clips: a 4% step is one run; read bands, not single rows. IS1009a barely reacts to small zero gaps (2% over 1-15 ms) while ES2004a does (27%), so the clip matters.
- The 4 chunk-boundary positions are too few to separate a boundary effect from the clip: they changed more often (zero 1-15 ms: 35% against 11% for the other positions), but it is 4 positions, two on one clip.
- ASR is chaotic: a 1 ms edit changes the model input, so some words flip with no information lost. The test cannot tell lost words from flipped words; it measures the transcript effect, which is the point.
- Windows are 30 s of audio through the whole-file command, not 8 hours; Opus chunk encoding (the recorder's 32 kbps chunks) was not applied; the live pass was not tested.
- Timestamp shift: not reliable. Word times come out of VAD-trimmed time, and identical-text variants with tiny zero gaps show shifts above 100 ms in 6 of 21 cases at 6 ms, so the shift count measures VAD boundary jitter, not the gap. It is in `gap-size-summary.py` output but not used here.
- Single gap per window; cumulative effect is reasoned from this, not measured.

## Recommended limits

1. **Per marked gap: 10 ms** (current proposal 20 ms). Reason: 20 ms is the first size where the transcript degrades beyond the floor; 15 ms is the last size inside it; 10 ms keeps one step of margin below the first harmful size and is still inside the flat band. A 20 ms limit sits exactly on the step.
2. **Cumulative: keep 100 ms per 8 h.** A gap only disturbs the one ~30 s VAD window around it, so total damage is count times window, not total milliseconds. Even 100 gaps of 20+ ms hit about 10% of an 8 h recording at a mean 2.8% WER, about 0.3% overall; ten 10 ms gaps (100 ms) hit about 1% of the recording at a mean 0.3% WER, about 0.003% overall. The data does not support a tighter or looser cumulative number; 100 ms is safe and consistent with the 10 ms per-gap cap (up to ten gaps at the cap). This is reasoning from a single-gap test.
3. **Unmarked loss is worse than marked.** Deleting samples changed the transcript in about two thirds of cases at any size. The rule should count any net removal or overlap of samples (time shift) as a failure, as in PR #248's "never net gaps or overlaps of 2 ms or more", and only accept gaps that keep the timeline.

Owner decision needed: adopt 10 ms and 100 ms, or keep 20 ms (the data shows 20 ms is where harm starts, not a safe edge).
