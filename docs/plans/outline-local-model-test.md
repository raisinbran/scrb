# Outline fill: local-model test (plan, revision 3)

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

**Role-level fact check (a candidate pair gets no credit if it fails).** From every point (generated and reference) extract a tuple: **who** (the owner or assignee of an action, or the speaker a statement is attributed to), **what** (the action or claim, as content words), **when/number** (dates, times, durations, quantities, amounts) and **polarity** (negation, and decisions such as approved/rejected, will/will not, yes/no). A pair passes only if, for every slot the reference point fills, the generated point fills the same slot with the same value: same owner, same numbers and dates after normalisation (for example "3rd of March" = "March 3"), same polarity. A slot the generated point fills that the reference leaves empty must be found **in the same role** in the transcript span the point cites (for example the name is the subject of the action or the person addressed with it, within the same clause); a name or number that merely appears somewhere in the span does not count. A failure in any slot makes the pair **contradicted**, not matched. Extraction is rule-based and frozen; its limits are covered by the adversarial cases below.

**Citation check.** Each generated point must cite a range of transcript words. It is **supported** only if the range exists and at least 50% of the point's content words occur inside it. A point with a missing, impossible or non-supporting citation is **unsupported** and gets no credit even if it resembles a reference point.

**One-to-one assignment.** Over all candidate pairs that pass both checks, take the maximum-total-similarity assignment in which each reference point is matched at most once and each generated point is credited at most once. Remaining generated points are scored as: **duplicate** (matches a reference point already matched by a better generated point), **contradicted**, **unsupported**, or **extra** (supported but matches nothing). Duplicates, contradicted, unsupported and extra points all stay in the precision denominator.

**Metrics (Task A, per meeting).**

- coverage = matched reference points / reference points.
- placement = matched pairs whose topic is the same / matched pairs.
- **placed coverage = coverage x placement** (the share of reference points that are both found and under the right topic). Reported with its two parts.
- precision = credited generated points / all generated points; contradicted rate and unsupported rate are also reported.
- **new-topic recall** = reference topics not in the outline that the model also proposes (topic titles matched by s >= tau) / reference topics not in the outline; **new-topic placement** = reference points that belong to topics not in the outline, are matched, and sit under the matching proposed new topic / reference points that belong to those topics and are matched (a matched point filed under an outline topic, or under a wrong new topic, counts as misplaced); "placement" above is **outline-topic placement** over the other matched points; overall placement over all matched points is also reported, but only the two parts drive GO; **false-new-topic rate** = proposed new topics matching no reference topic / proposed new topics.
- Outline topics the meeting never covered: the correct output is no points; any points generated under such a topic count against precision.

**Validate the scorer on invented cases before any private meeting is scored.** Two invented suites, each split at random into a tuning half and a held-out half; tau and the extraction rules are tuned on the tuning halves only, and the held-out halves are judged once.

- **General suite**, at least 60 labelled pairs: 20 paraphrases that should match, 15 clear contradictions, 15 irrelevant points, 10 duplicates. Required on the held-out half: paraphrase recall >= 85%, false credit on contradictions <= 5%, false credit on irrelevant points <= 5%, duplicates credited exactly once in 100% of cases.
- **Adversarial suite**, at least 60 pairs that look right but are wrong and must receive **zero credit**: 12 each of swapped owners (the task goes to Bob instead of Alice), swapped numbers, flipped negation, right entity with the wrong role (Bob is in the cited span but is not the one who takes the action), and right words with the wrong date. Required on the held-out half (at least 30 pairs, at least 6 per kind): **every pair rejected, zero credited**. Any credited adversarial pair, in the tuning or the held-out half, blocks private evaluation: it is listed as a defect, the scorer is corrected, and the whole suite is revalidated on fresh invented pairs before any private result counts.
  If either suite fails, the scorer is unreliable and every private result is INCONCLUSIVE until it is fixed and revalidated on fresh invented cases.

## 4. Task B: partial notes built by code (frozen scheme)

From each meeting's real final notes, build the partial notes with one script, fixed seed 20261115:

1. Sort points by topic order, then position. Define strata = (topic, length tercile by word count).
2. **Small strata are merged first:** a stratum with fewer than 4 points is merged with the adjacent length tercile of the same topic; a topic with fewer than 4 points in total is merged with the previous topic for stratification only. Strata that still have fewer than 4 points get no removals or moves.
3. **Removed set R:** in each stratum remove max(1, round(25% x n)) points. **Moved set M:** from the points left after R, in each stratum move max(1, ceil(12% x n)) points. R and M never overlap. **Rounding:** round() rounds halves up and ceil() rounds up; the counts are computed once and frozen with the seed.
4. **Destination rule:** a moved point goes to the end of the next other topic in outline order that has at least one point (cyclic), never its own topic and never an added topic.
5. Everything else is **untouched**. The script writes the change record (R, M, destinations) so scoring needs no human.

Scored separately:

- additions: precision (proposed additions that the one-to-one rule matches to a removed point) and recall (removed points recovered / |R|), each with the fact and citation checks;
- moves: precision (proposed moves that match a moved point and send it back to its origin topic / proposed moves) and recall (moved points correctly moved back / |M|);
- **false-move rate** = proposed moves of untouched points / untouched points;
- **unnecessary-edit rate** = untouched points that are reworded, moved or deleted / untouched points; **preservation** = 1 - that rate.

A test on a real partial-notes file (if the owner has one) is reported separately, scored only by the owner's rating, and never pooled with the built ones.

## 5. GO bars (all pooled across meetings, and met in at least 75% of meetings)

**A:** coverage >= 70%, outline-topic placement >= 80% (so placed coverage >= 56%; this is stated openly: about 4 in 10 reference points still end up missed or misplaced, which is acceptable only because every change is approved by the user), precision >= 70%, contradicted rate <= 5%, new-topic recall >= 50%, **new-topic placement >= 75%** (its own bar, so wrongly filed new-topic notes cannot hide inside overall placement), false-new-topic rate <= 20%. Every A metric is also reported per meeting, new-topic placement included.
**B:** additions recall >= 60% and precision >= 70%; moves recall >= 60% and precision >= 80%; false-move rate <= 2%; preservation >= 98%.
**Owner rating (an extra GO condition):** for up to 5 randomly chosen topics per meeting (seed frozen), the owner rates the generated notes locally on 1-5: 5 = approve as is, 4 = a few edits, 3 = about as much work as writing it with the transcript open, 2 = more work than writing it fresh, 1 = misleading. Required: mean rating >= 3.5 and at most 10% of rated topics scored 1, with **at least 15 rated topics pooled per model and tier** (fewer: the rating is not evaluable and the outcome is INCONCLUSIVE, never GO). Agents see only the numbers.

## 6. Duration and approval

Before any run, the plan states a **total campaign estimate**: setup, model downloads and loading, every run, scoring, and cleanup. First estimate: 2 tiers x 2 models x 4 meetings x 2 tasks = **32 runs at 3-6 minutes of generation each = 96-192 minutes of generation**, plus about 40 minutes of setup, downloads and model loads, 20 minutes of scoring and 10 minutes of cleanup: **a total of about 166-262 minutes (roughly 3-4.5 hours)** across the machines. Because the total far exceeds 20 minutes, **the owner's explicit approval of the campaign total is required before it starts**, even though each run is shorter. The estimate is recomputed after the invented-case pilot (which measures real speed) and the approved figure is the recomputed total; if the campaign passes 125% of the approved total, stop and ask. **No run is repeated automatically.**

## 7. Decision logic and what is frozen

- **Evaluation set:** at least 4 scored meetings (the current sample plus at least 3 more from the owner), including at least one longer than 1 hour. Fewer than 4 gives a smoke-test report only, never a decision.
- **Frozen before the first private run, in one committed manifest:** model files with versions and checksums, prompts, chunking, decoding settings (temperature 0, fixed seed), embedding model, tau and scorer rules, the Task B seed and scheme, all bars. Changing any of them after a private run restarts the evaluation.
- **Minimum evaluable examples (per meeting, per metric).** Coverage, precision and outline-topic placement: at least 20 reference points, 20 generated points and 10 matched pairs. New-topic recall: at least 2 reference topics not in the outline; new-topic placement: at least 5 matched points under them; false-new-topic rate: at least 3 proposed new topics. Task B additions: |R| >= 8; moves recall: |M| >= 5; moves precision: at least 3 proposed moves; additions precision: at least 3 proposed additions (below it, not evaluable); false-move rate and preservation: at least 50 untouched points.
- **Undefined is not zero.** A metric below its minimum in a meeting is **INCONCLUSIVE for that meeting**: it is shown as "not evaluable", left out of the pooled figure and out of the 75%-of-meetings count, and never scored as 0 or 100. (A model that proposes no moves at all when |M| >= 5 has move recall 0, which is evaluable and fails the bar; undefined precision never rescues it.)
- **Comparison:** every bar is compared on the unrounded score (69.6% fails a 70% bar); displayed percentages are rounded for reading only, and a score exactly on the bar passes.
- **Evaluable meetings needed:** a metric may drive GO or STOP only if at least 3 meetings are evaluable for it. A bar with fewer is INCONCLUSIVE; GO needs every bar evaluable, while STOP may rest on any single bar that is evaluable and failed.
- **Reporting:** per-meeting results (including "not evaluable") and the pooled result, per model and tier.
- **GO:** every bar met pooled and in at least 75% of the meetings evaluable for it, the owner rating condition met, scorer validated. At Tier 1: continue at minimum spec. Only at Tier 2: continue with the stronger model gated on the first-run benchmark, and Tier 1 treated as a degraded mode.
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
