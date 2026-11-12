# Vocabulary Gate 5, Stage 1 results (2026-11-12)

Plan: `docs/plans/vocabulary-gate5-evaluation.md`. Scorer: `scripts/research/score_vocab_eval.py` (reviewed before use). AMI only, offline decoding, no audio played, product code unchanged, every decode run once, no reruns.

## Verdict: FAIL by the plan's table (recall not higher), and the test was inert

**The hint-on output is word-for-word identical to the hint-off output** on TS3003a (all 2090 whisper entries have identical text), so nothing about recognition changed. Likely cause, **read in code, not yet confirmed by a controlled run:** the app's whisper arguments include `-mc 0` (`packages/*/src/whisper.ts`, `wholeFileArgs`). In whisper.cpp (`284029c`, `src/whisper.cpp` lines 7112 and 7296) the prompt budget is `min(n_max_text_ctx, n_text_ctx/2)` = 0 and prompt conditioning only runs when `n_max_text_ctx > 0`, so `--prompt ... --carry-initial-prompt` is accepted but dropped. If this is right, **the shipped hint feature has no effect on the offline final pass or import**, and this evaluation did not test whether hints would help. The earlier "hints reach recognition" reading in the plan did not account for `-mc 0`.

## Results

| Measure | Hints off | Hints on | Raw counts |
| --- | --- | --- | --- |
| Term recall (10 terms, 30 reference occurrences, exact aligned match) | 26.7% | 26.7% | 8/30 vs 8/30 (delta 0) |
| WER, TS3003a, 2534 reference words | 23.91% | 23.91% | 606 vs 606 errors (delta 0) |
| False replacements: held-out TS3003a | n/a | 0 | |
| False replacements: 7 negative controls | n/a | 0 | |
| Audio hours decoded with hints on | | 4.062 h | 0.419 held-out + 3.643 negatives |
| Rate / 95% upper bound (exact Poisson, scorer) | | 0 per h / 0.74 per h | |

Per-term recall is identical off and on (only "pen" is partly recalled, 8 of 11; the other nine terms 0 of 21). "Improvement within noise" is **left to the reviewer**: there is no improvement to judge, since outputs are identical. The zero false replacements is **not evidence of safety**, because the hint did nothing; the 0.74/h bound only describes this inert configuration.

Plan mapping: recall on is not higher than off, so **fail** ("hints stay on, no automatic fixer"). The more accurate reading is **not tested**; this is a stage 1 outcome for the owner and reviewer to decide, not a pass of any Gate 5 criterion. A pass would in any case have shown one meeting and one term set only.

## Terms (fixed before any hint-on run; `terms.json`, `hint.txt`)

Rule: TS3003a reference phrases (1 to 3 words, discourse fillers excluded) occurring at least twice, hint-off wrong (not an exact aligned match) at least twice, and **absent from all 7 negative-control references**. Four otherwise-eligible terms were dropped because they occur in negative references: white board (ES2003c, ES2004a, IS1009a), infra red (ES2003c, ES2014b), twenty five (5 files), interesting (EN2002d, ES2003c, ES2016c). Ten terms remain, the minimum: aquaintance, haunted, kick off, maximal twelve, sheep, shock proof, tool bar, waterproof, current colour, pen. Hint text (real `vocabularyHint`, 109 chars): `aquaintance, haunted, kick off, maximal twelve, sheep, shock proof, tool bar, waterproof, current colour, pen`. Weak points: the pool in this meeting is thin; "pen" and "sheep" are ordinary words; "maximal twelve" is partly a number-format issue. The scratch-library `enabledTerms()` path was not used (terms were passed as enabled term objects to `vocabularyHint`), unverified for the real library.

## Negative controls actually used (no exclusions; each reference checked, none contains a chosen term)

ES2003c 37.6 min, ES2014b 38.7, ES2015c 35.6, ES2016c 38.5, EN2002d 36.8 (under `eval-vocab/neg/`), ES2004a 17.5, IS1009a 14.0 (under `downloads/ami/`): 218.6 min = 3.643 h. Held-out TS3003a 25.1 min = 0.419 h. Hint-on total 4.062 h.

## Run facts

Hint-on decode times: TS3003a 27 s, negatives 19 to 60 s each (about 5.5 min total, RTF about 0.02). Same arguments as the hint-off run plus `--prompt "<hint.txt>" --carry-initial-prompt`. Commands/timings: `command-log.md`. Whisper.cpp `284029c`, model `ggml-large-v3-turbo-q5_0`.

## Unverified

That `-mc 0` is the cause (no controlled run with `-mc` > 0; that needs an owner decision and changes the app's arguments, so it is a product question); that other whisper.cpp versions behave alike; run-to-run determinism (single runs); number-format handling in the scorer ("12" vs "twelve" counts as an error); term representativeness; turbo as the app's final-pass model; the held-out "same place" rule was never exercised on real data (no events).

## Retained outputs (`~/scrb-dev-assets/eval-vocab/`)

`terms.json`, `hint.txt`, `command-log.md`, `off/TS3003a.json` (+ cmd/stdout/stderr), `on/TS3003a.json` (+ `.stdout`/`.stderr`), `neg_on/<ID>.json` (7 files, + logs), `neg/*.wav` (5 downloaded), `score.json`, `score.txt`. Nothing deleted. Summary copy: `/Users/brandonchen/Documents/ChatGPT/srcb/vocab-gate5-stage1-results-20261112.md`.

## Proposed next step (owner decision)

Change nothing automatically. Either confirm the `-mc 0` cause with one controlled hint-on run at `-mc` > 0 on TS3003a (about 30 s, but it also needs a plan note since it alters the whisper arguments the app ships), or treat vocabulary hints as non-functional for offline recognition until then.
