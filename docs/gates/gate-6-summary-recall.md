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
