# Vocabulary hint `-mc` test results (2026-11-12)

Plan: `docs/plans/vocabulary-hint-context-fix.md` (owner-approved to run). AMI only, offline, no audio played, product code unchanged, every decode run once (20 decodes, all rc=0, about 15 min), no reruns. Baseline for all comparisons is the shipped configuration, `-mc 0` (hint-off output is identical to hint-on at `-mc 0`). Scorer `score_vocab_eval.py` (contiguous phrases); loop/skip check `scripts/research/mc_loopcheck.py` (new). Same term set, hint text, model (turbo q5_0) and whisper.cpp `284029c` as Stage 1. Evidence: `~/scrb-dev-assets/eval-vocab/{mc64,mc128,mcdiag,base0}`, `mc-command-log.md`, `run_mc.sh`.

## Verdict: INCONCLUSIVE by the plan's rules, owner decides. Neither value passes.

| Measure (hint on) | `-mc 0` (shipped) | `-mc 64` | `-mc 128` |
| --- | --- | --- | --- |
| Held-out TS3003a term recall (30 occurrences) | 8 | 15 | 16 |
| Held-out WER | 23.91% | 23.60% | 23.05% |
| Held-out false replacements | 0 | 0 | 1 (see below) |
| Negative-control events (7 files, 3.643 h) | 0 | 1 (benign) | 1 (benign) |
| Table rate / exact 95% upper bound (4.062 h) | 0 / 0.74 per h | 0.25 / 1.17 per h | 0.49 / 1.55 per h |
| Loop/skip flags | none | 4 files | 1 file |

The plan's table passes only on zero events; 1 to 3 is inconclusive. The loop/skip rule (new repeated 4+ word phrase 3+ times, or WER worse by more than 1 point absolute) is not met at either value.

## Loop/skip flags (WER versus AMI reference, hint on, versus `-mc 0`)

- `-mc 64`: EN2002d new 4-word phrase repeated 3 times (WER +0.5 pt); ES2003c +2.75 pt; ES2015c +2.10 pt; ES2004a +2.75 pt.
- `-mc 128`: ES2003c +1.86 pt only (EN2002d now improves by 0.9 pt, ES2016c, ES2004a and IS1009a improve, ES2014b +0.5, ES2015c +0.6). Word-count ratios 0.98 to 1.02, no repeats above baseline. No sign of skipping or looping beyond that one WER flag.
- Held-out TS3003a improves at both values.

## The events (read, not assumed)

- **ES2004a, `-mc 64`, "pen":** hyp "I hope that pen is going to be"; the reference has "that pen's gonna be". A spelling-form difference (the scorer's whole-word rule does not match "pen's"). The speaker said pen, so not a real false replacement; it still counts by the plan's literal rule.
- **ES2015c, `-mc 128`, "kick off":** hyp "our kick off meeting"; the reference spells it "kickoff". Same kind of artifact, not a real replacement.
- **TS3003a held-out, `-mc 128`, "waterproof":** hyp "to fall a lot waterproof sure I mean no" where the reference has "...or uh so uh sure you never no". A real wrong word that the `-mc 0` output lacks. The Stage 1 addendum reported 0 held-out events at `-mc 128`; that run compared against hint-less `-mc 128` (which has "waterproof" at 3 places, more than hint-on's 2), so this word is probably caused by the non-zero context itself, not by the hint. Not verified (the hint-less `-mc 128` output was not compared at that exact place).

## Diagnostic: hint-less non-zero `-mc` (ES2004a, IS1009a; not a shipped configuration)

WER versus `-mc 0`: `-mc 64` ES2004a +0.95 pt, IS1009a -0.1 pt; `-mc 128` ES2004a -0.3 pt, IS1009a +0.15 pt. No repeats. So non-zero `-mc` alone is small and mixed on these two files; at `-mc 64` the hint-on ES2004a regression (+2.75) is larger than hint-less (+0.95), suggesting the hint adds to it there. The turbo "loops or skips" worry from the code comment did not show up as repeated phrases or large word-count changes in any of the 20 runs.

## Reading

`-mc 128` is the better value: more recall (16 vs 15), better held-out WER, one WER flag instead of four, no new repeats. It is not clean: one real held-out wrong word (probably non-zero-context related) and one file (ES2003c) 1.9 points worse. This is one meeting, one 10-term set, one model; it does not show Gate 5. Options for the owner:

1. Ship `-mc 128` with hint (recall roughly doubles on this meeting) accepting the ES2003c regression; Gate 5 stays open.
2. Run Stage 2 (more meetings and term sets) before changing anything.
3. Leave `-mc 0` and mark hints inert in the UI and docs.

## Not tested / unverified

Hint-less `-mc` on ES2003c (the one flagged file); a hint-less comparison at the held-out event's place; other `-mc` values; other terms or meetings; the live whisper-server path (`-mc 0`, untouched); run-to-run determinism across machines (the two TS3003a `-mc 128` runs here were word-for-word identical); the unit test and code change (not started, needs plan-approved owner go-ahead).
