# Gate 8 gap-size test: how much one short audio gap changes Whisper's output

Date: 2026-11-14. Input to the lost-audio limits in the gap-rule proposal (PR #251: 20 ms per marked gap, 100 ms total per 8 h). AMI audio only; the owner's recordings were never read.

## What was measured

For each variant, the **word edit distance to Whisper's own output on the unmodified window**, divided by that output's word count ("edit %"). This is not accuracy against a human reference and not a measure of harm: it shows how much the output changes when one gap is inserted, including changes that may be neutral or even closer to the truth. "Any word change" means at least one word differs from the unmodified output.

## Result

- **Control:** the unmodified window run twice gave identical word lists in 25 of 25 pairs, so the run itself is deterministic and every change below comes from the edit.
- **Zero-filled gap (time kept, as a marked gap would be), 1-15 ms:** any word change in 15% of runs, mean edit 0.30%, never 5 or more words. All sizes in this band look alike (8-20% per size, 25 runs each; one run is 4%).
- **Zero-filled, 20 ms and above:** any word change in 45% of runs, mean edit 2.79%, 5 or more words in 9%; it keeps rising to 72% at 200 ms. 20 ms is the first size clearly above the 1-15 ms band (36% changed, mean 1.67%, 22 words deleted across 25 runs against 1-4 for each size from 1 to 15 ms).
- **Removed samples (everything after the gap shifts earlier), any size from 1 ms:** any word change in about two thirds of runs, mean edit 4.8%, no trend with size.
- Even a 1 ms zero gap changes a word in 12% of runs, so output is sensitive to tiny edits; the test cannot say which changes are errors.

## Method

- Tools: `whisper-cli` (whisper.cpp commit 284029c07012d2000941a08d38a31ffb71f4734e) with the final-pass flags from `wholeFileArgs` in `packages/transcription/src/whisper.ts`: `-t 4 -l en --vad -mc 0 -ml 1 -sow -ojf -np -pp`, large-v3-turbo-q5_0, Silero VAD, Metal. File hashes are in the manifest below.
- Clips: AMI Mix-Headset ES2004a, IS1009a, TS3003a (16 kHz mono WAV), three speaker sets.
- Positions: 25 windows of 30 s, window starts on 5 s boundaries, `random.Random(20261114)`. 21 gaps are random inside speech (7 per clip, 5-24 s into the window); 4 start exactly on a 5 s chunk boundary (ES2004a 2, IS1009a 1, TS3003a 1). "Inside speech": the 500 ms around the gap is above that clip's median level. The same 25 positions are used for every size and mode.
- Variants: 17 sizes (1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100, 200 ms) x 2 modes x 25 positions = 850, plus per position the unmodified window twice (baseline and control) = 900 runs, 17.7 minutes with 2 workers.
- Position selection stops with a clear message after 5000 failed tries per clip and kind, or if a clip is shorter than 180 s.
- Scripts: `scripts/research/gap-size-test.py` (refuses a non-empty work directory; `--reset` deletes only a directory the script marked itself, never root, home, the repo or the current directory, tested in `test_gap_size_workdir.py`; outputs are never reused), `scripts/research/gap-size-summary.py`.

## Evidence in the repo

- [results](evidence/2026-11-14-gate8-gap-size-results.json): one row per variant and control (875): clip, window start, gap position, placement, size, mode, word counts, edit counts. No transcript text.
- [manifest](evidence/2026-11-14-gate8-gap-size-manifest.json): seed, the 25 positions, sizes, whisper flags, SHA-256 of the three input WAVs and both model files.
- Derivation: the raw whisper outputs (they contain transcript text, so they stay out of git) still existed locally after the run. The results and manifest were derived from them with `gap-size-test.py --evidence-only` after the run, not by a rerun; the derived per-run counts matched the counts first computed during the run for all 875 rows, and the 25 positions regenerate from the seed. The input and model hashes were taken at that time, not during the run; the files had not been replaced.
- Regenerate the tables: `python3 -I scripts/research/gap-size-summary.py docs/handoffs/evidence/2026-11-14-gate8-gap-size-results.json`.

## Table (25 positions per row)

"Max edit %" and "max words" are independent maxima over the 25 runs (different runs can produce each); they are not one worst run.

| gap ms | zero-filled: runs with any word change | mean edit % | max edit % | max words | removed: runs with any word change | mean edit % | max edit % | max words |
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

Pooled over all positions and sizes in the band:

| mode | gap ms | runs | any word change | mean edit % | 5+ words changed | words deleted per run |
|---|---|---:|---:|---:|---:|---:|
| zero | 1-15 | 250 | 15% | 0.30 | 0% | 0.12 |
| zero | 20-200 | 175 | 45% | 2.79 | 9% | 0.78 |
| remove | 1-15 | 250 | 66% | 4.80 | 26% | 0.96 |
| remove | 20-200 | 175 | 67% | 5.19 | 26% | 1.21 |

## Caveats

- AMI is not the owner's meetings: headset-mix audio, other rooms, no loudspeaker echo.
- 25 positions on 3 clips; read bands, not single rows. IS1009a barely reacts to small zero gaps (2% of runs over 1-15 ms) and ES2004a does (27%), so the clip matters.
- The 4 chunk-boundary positions are too few to separate a boundary effect from the clip: zero 1-15 ms changed a word in 35% of those runs against 11% for the other positions, but that is 4 positions, two of them on one clip.
- One gap per isolated 30 s window through the whole-file command. Not tested: several gaps, a full meeting, Opus-encoded 5 s chunks, the live pass.
- Timestamps were not analysed reliably (word times come out of VAD-trimmed time and jitter even for tiny zero gaps); no timestamp conclusion is drawn.

## Limits: what the data supports

- **10 ms per marked gap (candidate).** Conservative: 15 ms is the largest size that looks like the 1-15 ms band and the step appears at 20 ms, so 10 ms keeps one step of margin. This is not shown harmless; the test measures change against Whisper's own output only.
- **100 ms total per 8 h: a provisional owner-approved policy, not validated by this experiment.** The test used a single gap in an isolated 30 s window; it has no multi-gap, full-meeting or Opus-encoded result, so it cannot support or contradict a cumulative number.
- **Unmarked loss.** Removing samples changed the output in about two thirds of runs at every size. The data therefore favors counting any net removal or overlap as a failure (PR #248) and only accepting gaps that keep the timeline. That is a reading of one experiment, not a measured recorder behaviour.

Owner decision needed: keep 20 ms or adopt a lower candidate such as 10 ms.
