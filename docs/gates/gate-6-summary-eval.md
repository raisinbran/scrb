# Gate 6 evidence: summary recall, precision and links (2026-11-13)

**Result: not met on recall.** Pooled recall on the three held-out AMI meetings is **27/40 = 68%** against the 80% target. Links are all real (189/189); judged precision was **not run**. The set is tiny (40 reference sentences, 3 meetings), so every number moves several points per item.

## What was run

- Pipeline: the real engine (`packages/summary`, sectioned extraction plus coverage pass) on the local Qwen3.5-9B Q4_K_M with llama.cpp, Metal, on the owner's Mac. Brief/Full narratives were skipped (`--no-narrative`); they do not affect items.
- Set: AMI **held-out** meetings TS3005b, ES2015c, IS1004d (the prompts were frozen before these were read, per `packages/summary/eval/judgments.md`). Transcripts built from the local AMI annotations by `scripts/eval/prepare_ami_summary.py`; references are the annotators' abstractive action and decision sentences ("NA" entries dropped; IS1004d has no actions). No owner recordings were used. Transcripts and model outputs are not committed.
- Scorer: `packages/summary/eval/gate6.ts` (`node dist/eval/gate6.js <fixtures> <out> <meeting>...`), test in `test/gate6.test.ts`. Raw output: `docs/gates/gate-6/score.txt`, `score.json` (includes the missed reference sentences).

## Matching rule (chosen in advance, deterministic)

A reference sentence is **recovered** when one output action or decision contains at least 50% of its stemmed content words. Actions and decisions are pooled (annotators split them loosely); per-kind numbers are also shown. This is a word-overlap rule: it misses correct paraphrases and can credit near-misses, so it is **not equivalent to the earlier hand judging** (82% overall, 78% held-out, one judge). Use it for repeatable comparison, not as a replacement.

## Numbers

| Meeting   | Reference items | Recovered |  Recall | Output items (actions+decisions) | Output matching a reference |  Links real | Links also word-supported |
| --------- | --------------: | --------: | ------: | -------------------------------: | --------------------------: | ----------: | ------------------------: |
| IS1004d   |  12 (0 actions) |         5 |     42% |                               51 |                    18 (35%) |       58/58 |                     33/58 |
| ES2015c   |              13 |        11 |     85% |                               58 |                    26 (45%) |       63/63 |                     42/63 |
| TS3005b   |              15 |        11 |     73% |                               62 |                    37 (60%) |       68/68 |                     46/68 |
| **Total** |          **40** |    **27** | **68%** |                              171 |                    81 (47%) | **189/189** |                   121/189 |

- **Recall** below 80% in total and in two of three meetings. IS1004d is a final-design meeting full of small physical details, as in the earlier judging.
- **Precision**: "output matching a reference" is only a **lower bound** (AMI references are short; most unmatched output items are probably true but unannotated). A real precision figure needs the `--judge` option (the same local model checks each item against its cited lines; a model grading itself) or a human; **neither was run**. Earlier hand reading found about 16% non-items and 22% repeats.
- **Links**: every item (actions, decisions, open questions) cites a line that exists with its stored time (189/189). The stricter proxy (item shares 30% of its words with the nearby lines) passes 121/189; the failures I sampled (4 of 68) were correct paraphrases of the cited lines ("do more research on it" cited for "conduct further research on the kinetic energy source"), so that proxy undercounts. The engine's own quote check, which the scorer cannot see (quotes are not stored), is the real support test. Gate 6's "valid source text" is therefore met structurally and unproven by an independent semantic check.

## Cost

Extraction took 820 s (IS1004d), 906 s (ES2015c) and 880 s (TS3005b), peak llama-server memory 1.9 to 6.2 GiB as sampled (the sampler may have missed the real peak). The three runs went back to back for about 44 minutes, which **overran the 20-minute limit** (see the incident file).

## Not covered / next

- Judged precision (run `gate6.js ... --judge`, about 10 more minutes; needs owner approval).
- Reaching 80%: recall is the open problem; plan slice 6 (precision, cross-section check, model comparison).
- A larger set: only these six AMI meetings have transcripts locally; the other 140 have annotations and could be prepared the same way, but each costs about 15 minutes of model time.
