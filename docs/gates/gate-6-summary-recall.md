# Gate 6 summary recall: what was tried (2026-11-13)

**Result: recall not lifted; 80% not reached.** One pipeline change was tried; it did not help on the held-out meetings and was removed. The pipeline is unchanged from PR #196 (held-out recall 27/40 = 68%, links 189/189). Judged precision was run for the first time and is low (about 30%), which is now the bigger gap.

Same scorer and matching rule as `gate-6-summary-eval.md` (pooled actions plus decisions, an output item must contain at least 50% of the reference's stemmed content words). Model: local Qwen3.5-9B Q4_K_M, llama.cpp, Metal. No owner recordings; AMI only; transcripts and outputs stay out of git.

## Sets

- **Tuning** (never the held-out three): ES2016b, ES2008b, IS1009d (prepared for this task, 9 reference items). ES2012c was prepared and not run; TS3012b was left out because a full run would take over 20 minutes. Note ES2016b and ES2008b were also used when the prompts were first designed, so they have little headroom.
- **Held-out**: TS3005b, ES2015c, IS1004d, scored once with the changed pipeline.

## Misses of the 13 held-out reference items (from PR #196), by cause

| Cause                                         | Count | Items                                                                                                                                                                                                   |
| --------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Not extracted                                 |     8 | banana shape and leaf base; infrared port; weight and shade of yellow; single not double curve (all IS1004d); personal coaches, personal face places (ES2015c); ignore teletext; general menu (TS3005b) |
| Stale: output keeps what a later turn removed |     2 | solar cells (output lists solar cells and batteries), turbo button (output keeps it)                                                                                                                    |
| Merged into a longer item                     |     1 | teletext button sits inside a list of controls                                                                                                                                                          |
| Matching-rule artifact                        |     2 | speech recognition "optional if budget permits" (correct, 33% word overlap); LCD button list ("document the button layout", 45%)                                                                        |

So at most about 2 of 13 are scorer artifacts; crediting them gives 29/40 = 73%, still short. Most misses are small physical details and negative decisions in meetings that revise themselves (final-design meetings).

## Numbers

| Meeting            | Set      | Reference items | Baseline recovered | With specifics pass |
| ------------------ | -------- | --------------: | -----------------: | ------------------: |
| ES2016b            | tuning   |              16 |                 14 |                  14 |
| ES2008b            | tuning   |              17 |                 13 |                  14 |
| IS1009d            | tuning   |               9 |                  4 |                   4 |
| **Tuning total**   |          |              42 |       **31 (74%)** |        **32 (76%)** |
| TS3005b            | held-out |              15 |                 11 |                  11 |
| ES2015c            | held-out |              13 |                 11 |                  10 |
| IS1004d            | held-out |              12 |                  5 |                   5 |
| **Held-out total** |          |              40 |       **27 (68%)** |        **26 (65%)** |

Judged precision (the local model checks each item against its cited lines; a model grading itself, and clearly strict: ES2016b scores 25% judged against 82% reference-matching), tuning set only: baseline 50/169 (30%), with specifics pass 69/228 (30%). Held-out judged precision was not run (the held-out set was scored once). Links: every item cites a real line with its stored time, 251/251 held-out and 245/245 tuning with the pass.

## What was tried

- **Third coverage question "specifics"** (concrete details fixed or dropped, with the reason, one item per detail). Tuning +1, held-out −1 (an unrelated reference item lost its match, probably through dedupe shifting when 40% more items arrived), items per meeting up about 40%, judged precision unchanged. Removed.
- Not tried, with reason: other local models (Ministral 3 8B, Granite 4.2 8B) and other chunk sizes; each full comparison is about 15 minutes per meeting per setting, and the held-out set may be scored only once. Chunk and prompt changes that do not add a pass need full re-runs (the saved answers only help when requests are identical).

## Remaining gap and recommendation

- Recall: 68% on held-out against the 80% target; the misses are mostly not extracted details, which a fourth pass did not recover. The set is 40 items, so one item is 2.5 points: 68% and 65% are not distinguishable.
- Precision is the larger problem. Even allowing for the strict self-judge, about 30% judged and 35 to 60% reference-matched are far from 80%. Output has 50 to 90 items for 10 to 17 reference items.
- Recommendation: (1) do not add passes; (2) replace the self-judge with a human check of about 60 items before deciding precision, since the current figure cannot be trusted either way; (3) if the owner wants 80%, trial a larger local model or lower the target to about 70% recall for local 9B-class models, restating the gate in terms of a hand-judged set; (4) a final-design meeting needs a "later change overrides earlier" step, which is a design change, not a prompt tweak.

## Process

Eval runs: ES2008b baseline 15.6 minutes, IS1009d baseline 11.5, others minutes each from saved answers; three held-out runs 4 to 5 minutes each; judge runs 12 minutes and about 12 minutes. Each ran as a separate process, none over 20 minutes.

# Update 2026-11-14: reconcile step, and what it did not fix

**Result: neither target met. Recall 68% held-out (unchanged), precision still unknown to within a wide margin.** A reconcile step was added and measured; on these meetings it removes at most 1 item per meeting and changes no score. A capped version lowered recall and was left switched off. Links stay 100%.

## What was added (`packages/summary/src/reconcile.ts`, called when an extraction is finished)

1. **Near-duplicate merge**: same kind, same polarity (narrow negation test), within 5 minutes, at least 2 shared content words, word overlap (Jaccard) of 0.4, and the shorter wording's content words must all appear in the longer, so "iOS build" and "Android build" are not merged. Two owners stay two tasks. The better-supported item survives and keeps the other's cited line in `alsoAt`. This stage is new in this PR (the first dedupe in `dedupe.ts` is untouched).
2. **Later change overrides earlier** (deliberately narrow after five review rounds): an earlier action is dropped only when a later action at least 60 seconds on has the **same named owner** and exactly the same words in the same order, differing only by a negation word ("not", "never", "no longer", "cannot", or a contraction such as "won't"). Items without a named owner (all decisions, and actions with an unspecified or collective owner) are never overridden: removal needs positive evidence. "Remove" and "drop" are ordinary verbs, and a hyphenated compound such as "no-show" is not a negation. A reversal that is reworded, comes within 60 seconds, is a short statement, or uses a double negation is not handled.
3. **Cap**: kept items per meeting limited to a rate per minute, best-supported first (cited by several passes, settled status, first pass). Sized from the tuning reference lists only: 42 reference items over 107 minutes is 0.39 a minute; about two extracted items per reference sentence gives 0.8 a minute. **Off by default**, see below.

Every kept item keeps its own cited line and time; no link is rewritten.

## Numbers (same scorer and 50% matching rule as above; AMI only)

| Set                | Meeting | Items before | Items after |   Recall before |    Recall after | Reference-matched precision before |        after | Links after |
| ------------------ | ------- | -----------: | ----------: | --------------: | --------------: | ---------------------------------: | -----------: | ----------: |
| tuning             | ES2016b |           51 |          50 |           14/16 |           14/16 |                              42/51 |        41/50 |       57/57 |
| tuning             | ES2008b |           59 |          59 |           13/17 |           13/17 |                              21/59 |        21/59 |       67/67 |
| tuning             | IS1009d |           59 |          59 |             4/9 |             4/9 |                               4/59 |         4/59 |       61/61 |
| **tuning total**   |         |      **169** |     **168** | **31/42 (74%)** | **31/42 (74%)** |                       67/169 (40%) | 66/168 (39%) |     185/185 |
| held-out (once)    | TS3005b |           62 |          61 |           11/15 |           11/15 |                              37/62 |        36/61 |       67/67 |
| held-out (once)    | ES2015c |           58 |          58 |           11/13 |           11/13 |                              26/58 |        26/58 |       63/63 |
| held-out (once)    | IS1004d |           51 |          51 |            5/12 |            5/12 |                              18/51 |        18/51 |       58/58 |
| **held-out total** |         |      **171** |     **170** | **27/40 (68%)** | **27/40 (68%)** |                       81/171 (47%) | 80/170 (47%) |     188/188 |

The "before" rows reproduce the earlier results exactly (31/42 and 27/40), from the saved extractions of that run. The step is deterministic, so no model run was needed to score it; the held-out set was first scored once, after the settings were fixed on the tuning set. One held-out item is 2.5 points: the held-out recall did not move at all. Reference-matched precision is a lower bound (the reference lists are short summaries) and fell slightly because items that each matched the same reference sentence were merged. That is a counting effect, not a gain. Secondary (alsoAt) links: 34/34 held-out, 24/24 tuning. Held-out was scored a second time in this update, after review narrowed the merge and override rules; the rules were not chosen using held-out results, and held-out recall did not change.

## The cap, on the tuning set only

| Cap (items per minute) | Items kept of 169 |      Recall | Reference-matched precision |
| ---------------------- | ----------------: | ----------: | --------------------------: |
| none                   |               168 | 31/42 (74%) |                         40% |
| 1.2                    |               133 | 29/42 (69%) |                         46% |
| 1.0                    |               112 | 28/42 (67%) |                         46% |
| 0.8                    |                89 | 25/42 (60%) |                         47% |

The cap buys 6 to 7 points of reference-matched precision for 5 to 14 points of recall, and the precision stops improving below 1.2 a minute. The signals available to rank items (several passes agree, "Decided" or "Agreed", first pass) are weak: in the tuning output, 37% of single-pass items match a reference sentence against 57% of items two passes agreed on, and the status fields range only from 18% to 46%. A cap therefore removes wanted items as often as unwanted ones. It was not tried on the held-out set. The cap stays in the code as an option (`itemsPerMinute`), off.

## Does the data support "later overrides earlier"?

Not shown here. The step is tested (unit tests cover a same-owner reversal and many cases that must not override), but on these six AMI meetings the override never fired: the removed items are all merges, and the narrow rule was checked by comparing outputs before and after each tightening. Overrides are now limited to actions with a named owner, so a reversed decision (the usual case in a final-design meeting) is not handled at all. The stale misses recorded above (solar cells, turbo button) were not recovered on the held-out set; they were not asked to be, since the settings were fixed before held-out scoring.

## State of the targets and what remains

- **Recall 80%: not met.** Held-out 27/40 (68%), tuning 31/42 (74%). Misses are details the model does not extract; no pass or reconcile step recovered them.
- **Precision 80%: not measured honestly yet.** Reference-matched is 40% tuning and 47% held-out, a lower bound. The earlier judged figure (about 30%) is the model grading itself and is not used. The output still has 49 to 57 items per meeting for 9 to 17 reference items; deduplication cannot close that gap because the items are mostly different points, not repeats.
- **Next, in order of value**: (1) someone fills in [the hand-check pack](gate-6-hand-check-pack.md) (60 items, about 20 minutes) so precision is known; if most items are correct, the target should be restated against a hand-judged set rather than the short AMI reference lists; (2) only then consider a larger local model, which is the one lever not tried; (3) lowering the 70% to 80% recall target for local 9B-class models is the owner's decision.

## Process

No new model run for scoring. One narrative re-record of the ES2016b test recording (94 seconds) because the narrative now sees fewer items. Each scoring command ran in seconds; nothing approached 20 minutes. Own errors logged in A-359.
