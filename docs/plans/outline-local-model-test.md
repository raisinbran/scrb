# Outline fill: local-model test (plan, revision 2)

Status: draft for owner approval. Needs one more independent review round after this revision. No code, model runs or private-file reads are covered until the owner approves this plan.

## 1. Question and what a result means

Can a model that runs only on the owner's machines do both jobs well enough to justify continuing to build outline fill?

- **A. Recreate notes:** outline + transcript -> notes under each outline topic, plus topics raised in the meeting that the outline lacks.
- **B. Repair partial notes:** outline + transcript + partial notes -> proposed additions for missing points and proposed moves of points filed under the wrong topic, as tracked changes.

**GO means "continue development". It never means "ship".** The product assumes the user approves every generated change; no result in this plan removes that.

Outcomes: **GO**, **STOP**, or **INCONCLUSIVE** (section 7). One meeting never gives GO or STOP.

## 2. Hardware and minimum spec

| Machine   | CPU            | RAM                                                   | GPU memory      |
| --------- | -------------- | ----------------------------------------------------- | --------------- |
| BCHEN-W10 | Xeon W-11855M  | 64 GB                                                 | RTX A3000, 6 GB |
| Regiurn   | i7-14700K      | 32 GB                                                 | RTX 3080, 12 GB |
| Mac       | M5 MacBook Air | unified memory (size recorded by the runner at start) | shared          |

Owner decision: the **minimum spec is the weakest of the three machines**. Tier 1 = a model that runs acceptably there (about 7-8B parameters at 4-bit). Tier 2 = a larger model on Regiurn (about 14B at 4-bit) and, slower, on BCHEN-W10 with CPU offload. The app may later choose a stronger model on stronger hardware after a first-run benchmark. Each model must be approved by the owner before use; names and versions are chosen at the start of the campaign from what is installable then, and frozen (section 7).

## 3. Scoring (frozen before any private meeting is scored)

**Points.** One bullet or line is one point; a line over 40 words is split at sentence ends. Notes headings are topics, not points.

**Similarity** s(g, r) between a generated point g and a reference point r = 0.5 x cosine of embeddings from one fixed local embedding model + 0.5 x F1 of stemmed content words (words cut to 6 letters). A pair is a **candidate** when s >= tau; tau starts at 0.60 and is set only on the invented cases (below), then frozen.

**Fact check (a candidate pair gets no credit if it fails).** From each point extract numbers, dates, named entities (capitalised words not at a sentence start) and negations. The pair fails when g has a number or date that r lacks while r has a different one, a negation differs, or g names a person or entity found in neither r nor the transcript span g cites. A failed pair counts as **contradicted** (a penalty in precision, see below), not as a match.

**Citation check.** Each generated point must cite a range of transcript words. It is **supported** only if the range exists and at least 50% of the point's content words occur inside it. A point with a missing, impossible or non-supporting citation is **unsupported** and gets no credit even if it resembles a reference point.

**One-to-one assignment.** Over all candidate pairs that pass both checks, take the maximum-total-similarity assignment in which each reference point is matched at most once and each generated point is credited at most once. Remaining generated points are scored as: **duplicate** (matches a reference point already matched by a better generated point), **contradicted**, **unsupported**, or **extra** (supported but matches nothing). Duplicates, contradicted, unsupported and extra points all stay in the precision denominator.

**Metrics (Task A, per meeting).**

- coverage = matched reference points / reference points.
- placement = matched pairs whose topic is the same / matched pairs.
- **placed coverage = coverage x placement** (the share of reference points that are both found and under the right topic). Reported with its two parts.
- precision = credited generated points / all generated points; contradicted rate and unsupported rate are also reported.
- **new-topic recall** = reference topics not in the outline that the model also proposes (topic titles matched by s >= tau) / reference topics not in the outline; **new-topic placement** = points under those topics that land under the matching proposed topic; **false-new-topic rate** = proposed new topics matching no reference topic / proposed new topics.
- Outline topics the meeting never covered: the correct output is no points; any points generated under such a topic count against precision.

**Validate the scorer on invented cases before any private meeting is scored.** Build at least 60 labelled invented pairs: 20 paraphrases that should match, 15 contradictions (changed number, name, date, or negation), 15 irrelevant points, 10 duplicates. Tune tau and the extraction rules on a random half, then judge on the other half. Required: paraphrase recall >= 85%, false credit on contradictions <= 5%, false credit on irrelevant points <= 5%, duplicates credited exactly once in 100% of cases. If this fails, the scorer is unreliable and every private result is INCONCLUSIVE until it is fixed and revalidated.

## 4. Task B: partial notes built by code (frozen scheme)

From each meeting's real final notes, build the partial notes with one script, fixed seed 20261115:

1. Sort points by topic order, then position. Define strata = (topic, length tercile by word count).
2. **Removed set R:** in each stratum remove 25% of points (rounded to nearest, at least 1 in any topic with 4+ points).
3. **Moved set M:** from the points left after R, in each stratum move 12% (same rounding). R and M never overlap.
4. **Destination rule:** a moved point goes to the end of the next other topic in outline order that has at least one point (cyclic), never its own topic and never an added topic.
5. Everything else is **untouched**. The script writes the change record (R, M, destinations) so scoring needs no human.

Scored separately:

- additions: precision (proposed additions that the one-to-one rule matches to a removed point) and recall (removed points recovered / |R|), each with the fact and citation checks;
- moves: precision (proposed moves that match a moved point and send it back to its origin topic / proposed moves) and recall (moved points correctly moved back / |M|);
- **false-move rate** = proposed moves of untouched points / untouched points;
- **unnecessary-edit rate** = untouched points that are reworded, moved or deleted / untouched points; **preservation** = 1 - that rate.

A test on a real partial-notes file (if the owner has one) is reported separately, scored only by the owner's rating, and never pooled with the built ones.

## 5. GO bars (all pooled across meetings, and met in at least 75% of meetings)

**A:** coverage >= 70%, placement >= 80% (so placed coverage >= 56%; this is stated openly: about 4 in 10 reference points still end up missed or misplaced, which is acceptable only because every change is approved by the user), precision >= 70%, contradicted rate <= 5%, new-topic recall >= 50%, false-new-topic rate <= 20%.
**B:** additions recall >= 60% and precision >= 70%; moves recall >= 60% and precision >= 80%; false-move rate <= 2%; preservation >= 98%.
**Owner rating (an extra GO condition):** for up to 5 randomly chosen topics per meeting (seed frozen), the owner rates the generated notes locally on 1-5: 5 = approve as is, 4 = a few edits, 3 = about as much work as writing it with the transcript open, 2 = more work than writing it fresh, 1 = misleading. Required: mean rating >= 3.5 and at most 10% of rated topics scored 1. Agents see only the numbers.

## 6. Duration and approval

Before any run, the plan states a **total campaign estimate**: setup, model downloads and loading, every run, scoring, and cleanup. Rough first estimate: 2 tiers x 2 models x 4 meetings x 2 tasks at 3-6 minutes of generation each is about 1.5-2.5 hours across the machines, plus 30 minutes setup and scoring. Because the total exceeds 20 minutes, **the owner's explicit approval of the campaign total is required before it starts**, even though each run is shorter. The estimate is recomputed after the invented-case pilot (which measures real speed); if the campaign passes 125% of the approved total, stop and ask. **No run is repeated automatically.**

## 7. Decision logic and what is frozen

- **Evaluation set:** at least 4 scored meetings (the current sample plus at least 3 more from the owner), including at least one longer than 1 hour. Fewer than 4 gives a smoke-test report only, never a decision.
- **Frozen before the first private run, in one committed manifest:** model files with versions and checksums, prompts, chunking, decoding settings (temperature 0, fixed seed), embedding model, tau and scorer rules, the Task B seed and scheme, all bars. Changing any of them after a private run restarts the evaluation.
- **Reporting:** per-meeting results and the pooled result, per model and tier.
- **GO:** every bar met pooled and in at least 75% of meetings, the owner rating condition met, scorer validated. At Tier 1: continue at minimum spec. Only at Tier 2: continue with the stronger model gated on the first-run benchmark, and Tier 1 treated as a degraded mode.
- **STOP:** scorer validated, at least 4 meetings fully run, and the best candidate in every tier misses a primary bar (A coverage, A placement, B recall, or the rating) by more than 15 points pooled.
- **INCONCLUSIVE:** anything else, including fewer than 4 meetings, an incomplete or failed run, scorer validation failing, or results in between. Report what evidence is missing.

## 8. Privacy controls

- **The owner operates the private-data run.** Agents write and test the script on invented data only and never run it on a private meeting or read its inputs or outputs.
- **Local inference only.** The model server listens on localhost; the script refuses to start if it can reach a public host (a DNS and connection check), and the owner turns the network off for the run.
- **Numbers only on stdout and stderr and in logs.** Errors are fixed codes. No text, topic names, file names or paths.
- **Files outside Git and outside the repo:** model outputs, temp files and results go in a per-run folder under the owner's private samples folder; temp files are deleted at the end; outputs are kept only if the owner chooses.
- **Privacy test first:** run the whole pipeline on an invented meeting seeded with unique marker strings, then search stdout, stderr, logs, temp files and the repo for the markers; the only allowed place is the designated output folder. Any other hit blocks the private run.
- **Authorisation:** the owner's explicit written go in chat for this private-data evaluation, recorded in the results note. It does not carry over to other work.

## 9. Steps and deliverables

1. Owner approves this plan after independent review; owner approves candidate models and the campaign total (sections 2 and 6).
2. Build `npm run eval:model` (dev-only, no new runtime dependency in the app), the invented-case scorer suite, the Task B builder and the privacy test; independent code review.
3. Pilot on invented data: scorer validation, privacy test, speed, campaign estimate.
4. Owner supplies at least 3 more meetings; freeze the manifest.
5. Owner runs the campaign; numbers come back; owner gives ratings.
6. Results note with per-meeting and pooled numbers, outcome (GO, STOP or INCONCLUSIVE) and what it means for the next slice.

## 10. Risks

- Few meetings: a pass is a hint, which is why one meeting never decides.
- The reference notes are one person's wording; matching paraphrases is imperfect, which is why the scorer is validated on invented cases and the owner's rating is a GO condition.
- A model that passes only on stronger hardware makes quality depend on the machine; that case is called out in GO.
