# Vocabulary hints: `-mc` sweep and `--carry-initial-prompt` follow-up (2026-11-25)

**Verdict: FAIL at every setting. Recommendation: turn hints off (keep `-mc 0` in the final pass).** No hint-on setting reached the Stage 2 rule (aggregate WER no worse than hint-off, fewer than 4 false-replacement events). There is no `-mc` value just before a drop-off that keeps the recall gain without cost: WER broadly worsens as `-mc` falls, and the recall gain comes only from `--carry-initial-prompt`. **Independent review pending.**

Follow-up to [Stage 2](vocab-gate5-stage2-results-20261125.md) (PR #497). Owner approved long tests for this task on 2026-11-25. No shipped code changed; `HINTED_MAX_CONTEXT` in `packages/transcription/src/whisper.ts` is untouched.

## Setup

Same harness, audio and **frozen** term sets as Stage 2: whisper.cpp `284029c`, `ggml-large-v3-turbo-q5_0`, Silero VAD v6.2.0, `-t 4 -l en --vad -ml 1 -sow -ojf`, the same 13 AMI meetings (7.435 h, 255 term occurrences, 71,623 reference words), scored with `scripts/research/vocab_stage2.py score` unchanged (recall, WER, held-out false replacements, negative-control events). Only `-mc` and the carry flag changed. Hint-on arms: `--prompt <hint>` with (**carry**) and without (**nocarry**) `--carry-initial-prompt`, at `-mc` 16, 32, 48, 64, 96, 128 (carry 128 reuses the Stage 2 decodes). Baselines: hint-off `-mc 0` (the no-hint production setting, the baseline for everything below), the Stage 2 hint-off `-mc 128`, and one extra control, hint-off `-mc 64`. Each decode ran once, no retries, none failed (169 sweep decodes: 11 new hint-on arms x 13 = 143, plus hint-off `-mc 0` and `-mc 64` x 13 = 26; plus 39 negative-control decodes = 208 in all; 0 FAILED). AMI audio only, no owner recordings. Raw JSON, logs and scoring files stay in `~/scrb-dev-assets/eval-vocab/s2/sweep/` (not committed). The runner is `sweep_run.sh` there; each command is in `sweep/command-log.md`.

## Baselines

| Hint-off | Recall | WER | Deletions |
|---|---|---|---|
| `-mc 0` | 106 of 255 | **26.40%** | 14,769 |
| `-mc 64` | 103 of 255 | 27.39% | 15,589 |
| `-mc 128` (Stage 2) | 92 of 255 | 25.44% | 14,095 |

## Results (all hint-on, scored against hint-off `-mc 0`)

| `-mc` | Arm | Recall | WER | vs 26.40 | Deletions | Meetings >1 pt worse | Held-out events |
|---|---|---|---|---|---|---|---|
| 16 | carry | 138 | 30.21% | +3.81 | 17,759 | 12 | 5 |
| 16 | nocarry | 112 | 29.77% | +3.37 | 17,368 | 12 | 5 |
| 32 | carry | 154 | 29.12% | +2.72 | 17,120 | 12 | 1 |
| 32 | nocarry | 108 | 28.64% | +2.24 | 16,600 | 8 | 1 |
| 48 | carry | 147 | 28.53% | +2.13 | 16,553 | 10 | 2 |
| 48 | nocarry | 110 | 29.36% | +2.96 | 17,083 | 12 | 0 |
| 64 | carry | 148 | 28.34% | +1.94 | 16,357 | 10 | 6 |
| 64 | nocarry | 110 | 28.69% | +2.29 | 16,634 | 10 | 3 |
| 96 | carry | 151 | 27.52% | +1.12 | 15,683 | 8 | 9 |
| 96 | nocarry | 116 | 27.60% | +1.20 | 15,801 | 8 | 3 |
| 128 | carry | 155 | 26.94% | +0.54 | 15,204 | 4 | 4 |
| 128 | nocarry | 114 | 26.64% | +0.24 | 14,864 | 5 | 4 |

Against the Stage 2 hint-off `-mc 128` baseline the carry-128 and nocarry-128 WER rises are +1.50 and +1.20 points. No setting has WER at or below the `-mc 0` hint-off baseline, so none passes the "WER no worse" rule, and none is "just before a drop-off": the carry arm worsens as `-mc` falls and the no-carry arm broadly does (29.77, 28.64, 29.36, 28.69 at 16, 32, 48, 64), so there is no sweet spot. The least bad on WER is `-mc 128`; the 1-point skip rule is worst at low `-mc` (8 to 12 of 13 meetings at `-mc` 16 to 64).

## What `--carry-initial-prompt` does, and whether it explains the skipping

In whisper.cpp the initial prompt (`--prompt`) normally conditions only the first decode window; later windows are conditioned on the previous window's text. With `--carry-initial-prompt` the prompt is re-prepended to **every** window, so the hint terms stay in the decoder context throughout the file.

- **It is what produces the recall gain.** Without it, the hint barely helps (nocarry recall 108 to 116 against 106 baseline at every `-mc`; carry 138 to 155).
- **It is not the main cause of skipping.** The nocarry arm, which has no carried prompt, skips just as much (deletions 14,864 to 17,368, similar to carry) and has similar WER at every `-mc`. Hint-off at `-mc 64` already raises WER to 27.39% (deletions +820 over `-mc 0`). At `-mc 64`, hint-off adds +0.99 points over `-mc 0`, against +1.94 for carry and +2.29 for no-carry, so a substantial part of the rise comes from the context setting itself, but not all of it. Run-to-run noise is unmeasured: hint-off `-mc 0` and `-mc 128` differ by about 1 point on single decodes.
- **Carry adds a smaller extra cost at the same `-mc`:** at 128, carry is +1.50 points over the hint-off `-mc 128` run and nocarry +1.20; at 64, carry 28.34% against hint-off 27.39% (+0.95). Single decodes, so differences of about 0.3 points between arms are not separable from run-to-run noise (not measured).
- Side observation (not tested further, single run): hint-off `-mc 128` (25.44%) beat hint-off `-mc 0` (26.40%) and hint-off `-mc 64` (27.39%), so the effect of `-mc` alone is not monotone; if the owner wants the no-hint default revisited, that needs its own test with repeats.

## Negative controls (3 foreign hints per meeting, 39 decodes, 22.31 exposure hours each)

Run for the two best carry settings (the only ones with a recall gain of 40 or more and the smallest WER cost):

| Setting | Held-out false replacements | Negative-control events | Total events | Events per exposure hour (95% upper; basis 29.74 h = 7.435 own-hint + 22.31 negative) | Verdict |
|---|---|---|---|---|---|
| carry 128 (Stage 2 decodes, scored against `-mc 0` off) | 4 | 1 | 5 (Stage 2 count against its own baseline: 3 + 1 = 4) | 0.17 (up to 0.35) on 29.74 h | FAIL |
| carry 96 | 9 | 2 | 11 | 0.37 (up to 0.61) on 29.74 h | FAIL |

carry 96 negative events: ES2014b under IS1009b's hint and ES2015c under IS1009c's hint (one learned-term occurrence each). Negative-control events alone: 1 and 2 over 22.31 h, 0.045 and 0.09 per hour. Both settings meet the "4 or more" FAIL band of the approved plan table, and both have WER above the baseline.

## Recommendation

**Turn hints off in the final pass** (no hint prompt, `-mc 0`). The best recall-preserving setting, carry at 128, costs +0.54 WER points against the no-hint baseline (+1.50 against the same-`-mc` baseline), skips speech in 4 meetings by over 1 point, and produces 4 to 5 false-replacement events. Lower `-mc` makes WER and skipping worse, and dropping the carry flag removes the recall gain. A hint design that does not add a window-wide prompt (for example a correction pass that only replaces terms in a finished transcript, as the approved Stage 2 plan describes) is the untested alternative. The hints-off recommendation is already shipped in #505.

## Limits

Frozen mechanical term sets chosen on the same meeting they are scored on (recall is optimistic); one decode per condition, no determinism or noise estimate; 13 meetings, 7.4 h; negative controls only for two settings; carry 128 held-out count differs by baseline (4 against `-mc 0` off, 3 against `-mc 128` off); no `-mc` sweep for hint-off beyond 0, 64 and 128.

## Cost and usage

Estimate given before running: about 3 h (one hint-on pass about 11 to 20 min, 11 passes, plus 39 negatives about 36 min). Actual: 208 decodes, 24,234 s of summed decode time (6.7 h) over 2 to 3 parallel streams, wall time about 3 h 39 min (09:45 to 13:24 PST), **over the 3-hour budget** (logged as an incident). Usage: 5-hour window 5% to 9% used, weekly 54% to 59% used (read at start and end).
