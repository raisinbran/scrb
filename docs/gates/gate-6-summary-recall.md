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

**Result: neither target met, and the reconcile step changed nothing on these meetings.** Recall is 74% tuning and 68% held-out, exactly as before; the outputs of all six meetings are byte-identical to the unreconciled outputs. Links stay 100%. A capped version lowered recall and is switched off.

## What is in the code (`packages/summary/src/reconcile.ts`, run when an extraction is finished)

1. **Later change overrides earlier**, deliberately narrow after review: an earlier action is dropped only when a later action at least 60 seconds on has the **same named owner** and exactly the same words in the same order, differing only by a negation word ("not", "never", "no longer", "cannot", or a contraction such as "won't"). Decisions and ownerless actions are never overridden, since removal needs positive evidence; "remove", "drop" and compounds such as "no-show" are not negation. Not handled: reworded reversals, reversals within 60 seconds, short statements, double negation, a changed owner or deadline, and reversed decisions (the usual case in a final-design meeting). On these six meetings it never fired.
2. **Cap** (per-meeting item limit, best-supported first), sized from the tuning reference lists only: 42 reference items over 107 minutes is 0.39 a minute; about two extracted items per reference sentence gives 0.8 a minute. **Off by default.**

A near-duplicate merge was written and removed in review: it merged two different tasks by the same owner ("Test deployment" and "Test deployment rollback"), and a lexical rule cannot reliably tell a repeat from a related task. The existing first dedupe in `dedupe.ts` stays as it was, with one known problem: [handoff note](../handoffs/summary-dedupe-merges-different-builds.md).

Every kept item keeps its own cited line and time; no link is rewritten.

## Numbers (same scorer and 50% matching rule as above; AMI only)

| Set      | Items | Recall      | Reference-matched precision | Links        |
| -------- | ----: | ----------- | --------------------------: | ------------ |
| tuning   |   169 | 31/42 (74%) |                67/169 (40%) | 186/186 real |
| held-out |   171 | 27/40 (68%) |                81/171 (47%) | 189/189 real |

Before and after are identical. One held-out item is 2.5 points. Reference-matched precision is a lower bound because the reference lists are short summaries. Held-out was scored once earlier and not rescored for the final state, since the outputs did not change from the unreconciled ones.

## The cap, on the tuning set only

| Cap (items per minute) | Items kept of 169 | Recall      | Reference-matched precision |
| ---------------------- | ----------------: | ----------- | --------------------------: |
| none                   |               169 | 31/42 (74%) |                         40% |
| 1.2                    |               133 | 29/42 (69%) |                         46% |
| 1.0                    |               112 | 28/42 (67%) |                         47% |
| 0.8                    |                89 | 25/42 (60%) |                         47% |

The cap buys 6 to 7 points of reference-matched precision for 5 to 14 points of recall. The signals available to rank items (several passes agree, "Decided" or "Agreed", first pass) are weak: in the tuning output, 37% of single-pass items match a reference sentence against 57% of items two passes agreed on, and the status fields range only from 18% to 46%. A cap therefore removes wanted items as often as unwanted ones. Not tried on held-out.

## State of the targets and what remains

- **Recall 80%: not met.** Held-out 27/40 (68%), tuning 31/42 (74%). The misses are details the model does not extract; no extra pass, merge, override or cap recovered them.
- **Precision 80%: not measured honestly yet.** Reference-matched is 40% tuning and 47% held-out, a lower bound. The earlier judged figure (about 30%) is the model grading itself and is not used. The output still has 51 to 62 items per meeting for 9 to 17 reference items, mostly different points rather than repeats.
- **Next, in order of value**: (1) someone fills in [the hand-check pack](gate-6-hand-check-pack.md) (60 items, about 20 minutes) so precision is known; if most items are correct, restate the target against a hand-judged set rather than the short AMI reference lists; (2) only then consider a larger local model, the one lever not tried; (3) lowering the recall target for local 9B-class models is the owner's decision; (4) a reliable "later change overrides earlier" for decisions needs the model to say which earlier decision a later one replaces, which is a prompt and schema change.

## Process

No model run for scoring (the step is deterministic and runs on saved extractions). Each command ran in seconds; nothing approached 20 minutes. My own errors are logged in A-359 and A-360.
