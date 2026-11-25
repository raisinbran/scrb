# Vocabulary Gate 5 Stage 2: FAIL (hint at `-mc 128` skips speech), completed 2026-11-25

**Verdict: FAIL.** Two independent reasons. (1) Aggregate word error rose with hints, 25.44% to 26.94% (+1.50 points), mostly from skipped speech (see below), so "recognition improves" is not met even though term recall rose (92 to 155 of 255). (2) The false-replacement count is 4 events, which is the FAIL band (4 or more) of the approved [vocabulary-stage2.md](../plans/vocabulary-stage2.md) negative-control table. The rate is 0.13 per exposure hour (95% upper 0.31), but per unique audio hour (7.435 h) it is 0.54 with a 95% upper bound of 1.23, above 1, so the under-1-per-hour limit is **not shown to be met**. **Independent review pending.**

**Authorization:** on 2026-11-25 the owner released Stage 2 in chat ("this is allowed to proceed") and lifted the 20-minute test limit ("All tests lengths are allowed"). Stage 2 definition: [vocabulary-gate5-evaluation.md](../plans/vocabulary-gate5-evaluation.md); earlier results: [Stage 1](vocab-gate5-stage1-results-20261112.md), [mc test](vocab-mc-test-results-20261112.md), [H1](vocab-h1-hint-test-2026-11-15.md).

## Setup (reused harness, nothing redesigned)

- AMI public audio only, no owner recordings. 17 meetings, **9.65 unique audio-hours** on disk: 5 already local (EN2002d, ES2003c, ES2014b, ES2015c, ES2016c), 3 first-meeting files (ES2004a, IS1009a, TS3003a), and 9 fetched with `scripts/dev-assets.sh ami-series` (ES2004b-d, IS1009b-d, TS3003b-d; pinned SHA-256 verified by the script). The AMI mirror returned HTTP 503 for several minutes; the script was re-run in a loop (about 12 tries) until it succeeded. **Shortfall:** the plan's about 22 audio-hours of unique audio was not available from the repo's pinned downloads (9.65 h). Unpinned AMI meetings were not downloaded.
- whisper.cpp `284029c`, `ggml-large-v3-turbo-q5_0`, Silero VAD v6.2.0, `-t 4 -l en --vad -mc 128 -ml 1 -sow -ojf`; hint on adds `--prompt <hint> --carry-initial-prompt`; hint-off is the same at `-mc 128`. Each decode ran once, none rerun, all rc=0.
- Per meeting a mechanical term rule (`scripts/research/vocab_stage2.py select`): 1 to 3 word phrases from the reference, dictionary words, not stopwords, numbers, contractions or fragments; at least 2 reference occurrences; hint-off wrong at least 2 times; absent from the references of all meetings of other series; top 10 by wrongness. Chosen from the **hint-off output of the same meeting** (mirrors a user's corrections), frozen before any hint-on decode. Meetings with fewer than 3 eligible terms were dropped (ES2016c, IS1009a, TS3003b, TS3003d), leaving **13 meetings, 7.435 h**. Term sets and hints are in `~/scrb-dev-assets/eval-vocab/s2/terms/` (not committed).
- **Negative controls:** each of the 13 meetings was also decoded with the hints of 3 other meetings (different series, no term in its reference, checked: 0 clashes): 39 decodes, **22.31 exposure hours**. These repeat the same audio under different hints; per unique hour the exposure is 7.435 h.
- Selection note: the first selection pass had a code bug (list vs tuple, 0 terms) and a second pass tightened the rule (dictionary words, no numbers or contractions) and relaxed series exclusivity. All of this happened before any hint-on decode and is logged as incident A-1163; usage was not read at task start (A-1164), and the AMI download needed a retry loop because of mirror 503s.

## Relation to the approved plan, and the verdict rules

The approved plan (`docs/plans/vocabulary-stage2.md`, section 4) names ES2003c and ES2015c as calibration meetings, sets the events bar at 0 = PASS, 1 to 3 = INCONCLUSIVE, 4 or more = FAIL, and centres on a correction pass and an H1 hint test. **This run follows the older Stage 2 definition in `vocabulary-gate5-evaluation.md` (more AMI meetings and term sets, hints at `-mc 128`) and departs from the plan in these ways:** all meetings, including ES2003c and ES2015c, were scored as own-hint meetings with no calibration/held-out split; terms were chosen from each meeting's own hint-off output; no correction pass was run; the verdict rule below is rate-based, not the plan's count table. Under the plan's count table the 4 events would also be FAIL.

## Verdict rules (written in `vocab_stage2.py` and frozen before the hint-on decodes, per the command log; not an earlier commit)

FAIL if aggregate recall on <= off, or aggregate WER on > off, or the point false-event rate >= 1 per exposure hour. PASS if none of that, the 95% upper bound of the rate is under 1 per exposure hour, and no meeting's WER is worse by more than 1 point. Otherwise INCONCLUSIVE. Events = own-hint held-out false replacements (scorer rule b) + learned-term occurrences in negative-control output (rule a), none netted.

## Results

| Meeting | h | Recall off to on | WER off to on | Held-out events | Neg events (3 hints) |
|---|---|---|---|---|---|
| EN2002d | 0.614 | 29 to 34 of 58 | 38.65% to 39.42% | 1 | 0 |
| ES2003c | 0.627 | 3 to 5 of 9 | 25.19% to 25.42% | 0 | 0 |
| ES2004a | 0.291 | 3 to 3 of 11 | 27.10% to 28.27% | 0 | 0 |
| ES2004b | 0.652 | 0 to 2 of 10 | 23.83% to 24.45% | 0 | 0 |
| ES2004c | 0.648 | 0 to 10 of 10 | 20.26% to 24.32% | 0 | 0 |
| ES2004d | 0.617 | 12 to 14 of 20 | 29.84% to 29.59% | 0 | 0 |
| ES2014b | 0.644 | 4 to 9 of 12 | 26.74% to 29.04% | 0 | 1 |
| ES2015c | 0.593 | 11 to 15 of 24 | 22.43% to 22.30% | 1 | 0 |
| IS1009b | 0.570 | 29 to 39 of 46 | 20.29% to 24.49% | 1 | 0 |
| IS1009c | 0.506 | 0 to 4 of 13 | 18.58% to 24.16% | 0 | 0 |
| IS1009d | 0.540 | 0 to 9 of 16 | 23.62% to 23.54% | 0 | 0 |
| TS3003a | 0.418 | 1 to 5 of 18 | 23.32% to 22.10% | 0 | 0 |
| TS3003c | 0.714 | 0 to 6 of 8 | 25.73% to 26.48% | 0 | 0 |
| **All** | 7.435 | 92 to 155 of 255 | 25.44% to 26.94% | 3 | 1 |

Events (read, not netted): held-out EN2002d "boring" (ref "because boring", a nearby filler difference), ES2015c "backup" (hyp and ref differ by a nearby "may as"), IS1009b "remote controller" (ref has an interjection "mm hmm" inside the phrase); negative ES2014b with TS3003a's hint: "bigger sheep are", a plausible real false replacement.

**Rates:** 4 events over 29.74 exposure hours = 0.134 per hour (95% upper 0.31); per unique audio hour (7.435 h) 0.54 per hour (95% upper 1.23). The under-1-per-hour limit is met on the point estimates; the unique-hour upper bound is not under 1.

**Why WER is worse (checked by alignment counts, hint-off vs hint-on):** deletions rise while substitutions stay flat: ES2004c 1100 to 1354, IS1009c 658 to 927, IS1009b 958 to 1263, ES2014b 1250 to 1366; hypothesis word counts fall 4 to 8%. Both conditions use `-mc 128`, so the extra skipping comes from the hint (with `--carry-initial-prompt`), not from the context setting alone. Five meetings exceed the 1-point loop/skip rule (ES2004a, ES2004c, ES2014b, IS1009b, IS1009c); four meetings improved (TS3003a, ES2004d, ES2015c, IS1009d) and nine got worse. Each decode ran once, so some per-meeting change is within run-to-run noise; the +1.50 points come mostly from deletions in five files (ES2004c +4.07, IS1009b +4.19, IS1009c +5.57, ES2014b +2.31, ES2004a +1.17 points). This contradicts the earlier one-meeting findings and explains why recall gains did not turn into lower WER.

## Limits of this evidence

Term sets were mechanical and chosen on the same meeting they are scored on (recall is optimistic; real learned terms differ). 7.4 h own-hint and 9.65 h unique audio, not about 22 h. Single decode per condition, no determinism check. Per-meeting term counts vary 1 to 10. Whether skipping depends on hint length or term type was not tested. Live path and the owner's meetings untouched.

## OWNER DECISION: what to do about hints

Hints have been live in the offline final pass and import since PR #124 (`-mc 128` when a hint is present); nothing was changed or turned off by this work. Options: (a) leave as is and accept possible dropped speech on meetings with learned terms; (b) disable hints or revert to `-mc 0` (hints then do nothing); (c) run follow-ups first (untested): shorter hint, fixed term count, `-mc` below 128, or `--prompt` without `--carry-initial-prompt`. Gate 5's vocabulary criterion is **not met** on this evidence.

## Commands and timings

`scripts/dev-assets.sh ami-series`; `scripts/research/vocab_stage2_run.sh off|on|neg` (every command is in `s2/command-log.md`); `python3 scripts/research/vocab_stage2.py select|score --s2 ~/scrb-dev-assets/eval-vocab/s2 --ann ~/scrb-dev-assets/downloads/ami/ann/words`. Decode wall time: off 17 decodes 1,693 s; on 13 decodes 670 s; neg 39 decodes 2,151 s; total 4,514 s (75 min) for 39.4 audio-hours. Raw JSON, logs, terms and `score.json` stay in `~/scrb-dev-assets/eval-vocab/s2/`, none committed or deleted.
