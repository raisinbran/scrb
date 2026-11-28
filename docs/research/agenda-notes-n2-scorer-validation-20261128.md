# N2 scorer validation: blocked claim audit and model-free calibration

**2026-11-28 | Base `89c2a4c9` | Invented data only | INCONCLUSIVE.** Follow-up to [N2 stage 1](agenda-notes-n2-stage1-20261125.md). No inference, embedding model, Mac execution or private-data access. The frozen scorer defaults remain unchanged. This is not permission to advance N3–N5.

## 1. The 17 rejected claims: not adjudicable from retained evidence

Stage 1 reports 24 correctly kind/topic-classed decisions with valid original citations; 7/36 credited, 17 refused solely by similarity (0.649–0.687). The corrected 24/36 counts evidence-line coverage and matching values, not claim meaning.

Source audit at the base SHA: `agenda-compare.ts` retains backend responses in the in-memory `raws` array, but writes aggregate citation shapes, rows and `dump` into the result JSON. `dump` explicitly skips facts with `why === 'ok'`. The 17 decisions all had OK verification, and `decDiag` contains numbers/indices, not claim text. The repository and report do not contain their rewritten text; the saved numeric result alone is insufficient. Independently saved raw response logs on the original machine, if any, were not accessible.

**Manual adjudication: 0/17 assessed; 17/17 unknown.** Recover the saved invented-only generated claims, reference, and evidence spans for seeds 19–30 (with seed/fact index and original similarity) if they exist. Regenerate gold references with `synthMeeting` without a model; classify each pair correct / wrong / ambiguous and record the reason (meaning, owner/role, value/date, polarity, qualification). If responses were not retained, a new inference run requires separate owner approval; no such run was attempted. A future approved run should preserve the synthetic claims before discarding the in-memory responses. Never copy any owner data into this workflow.

## 2. Model-free sensitivity experiment

Ran the runtime logic of the source-pinned scorer/suite functions in an isolated JavaScript environment after removing TypeScript-only syntax; this was exploratory, not a TypeScript build or repository check. The first type-stripping attempt failed to parse; corrected once. Single-threaded, about 5 seconds for the sweep, using the existing deterministic character-trigram stand-in, **not MiniLM**. No model inference. The actual embedding model/threshold combination remains unvalidated.

Grid: embedding weights 0.50, 0.65, 0.80, 1.00 (word weight = 1 minus embedding weight); tau 0.30 through 0.90 in steps of 0.01. Existing fixed stratified split; selection uses tuning only: zero adversarial, contradiction and irrelevant credits, duplicates exactly once, then maximize paraphrase recall, break ties by higher tau then lower embedding weight. All 244 configurations passed the tuning negative/duplicate checks; selected tau **0.79**, weights **0.80/0.20**, tuning paraphrases 10/10. Evaluate that fixed candidate once on held-out suites; do not retune against the held-out result.

| Metric | Historical tau 0.79, weights 0.50/0.50 (trigram, held out) | Candidate tuning | Candidate held out |
| --- | ---: | ---: | ---: |
| Correct paraphrases | 6/10 | 10/10 | 8/10 |
| Contradictions credited | 0/8 | 0/7 | 0/8 |
| Irrelevant claims credited | 0/8 | 0/7 | 0/8 |
| Duplicates credited exactly once | 5/5 | 5/5 | 5/5 |
| Adversarial false credits | 0/42 | 0/42 | 0/42 |

All seven adversarial categories (swapped owner, swapped number, flipped negation, wrong role, wrong date, action inversion, wrong-action date) had 0/6 credits each on each candidate half. Net held-out paraphrase credit rose by two, but **8/10 = 80%, below the frozen 85% general-suite bar**; two correct suite paraphrases remain refused. These are not the historical 17. Zero false credit on a finite suite is not proof against other wrong meanings, especially a different vendor, hiring role or decision status at the right line. Do not adopt the candidate or line-only credit.

## 3. Reproduce and next step

The diagnostic adds an explicit optional embedding weight to matching and the suite helpers; existing default weights and tau, citation/fact checks, one-to-one assignment and campaign decision logic remain unchanged. From `packages/outline` with installed dependencies, run `node --import tsx eval/model-test/agenda-calibration.ts` (equivalent to `npx --no-install tsx eval/model-test/agenda-calibration.ts`; one sequential scorer process, no model, fixed invented suites, JSON counts only; expected exit 1 for the failed bars). The original exploratory execution was not this command. The original head's CI passed after one retry of an unrelated Windows smoke test; it did not execute this entry point. The review correction adds `test/model-test/agenda-calibration.test.ts` in the existing test directory so normal unit-test CI discovers it. It checks the supported-pair weight override, default equivalence, invalid weights before embedding in both wrappers, and invokes the exact documented command once, recording JSON counts and asserting the expected exit and result. The new test has a bounded 30-second child-process timeout; it does not download a model or retune against held-out results. The cloud checkout still cannot resolve GitHub, so the exact command, updated test and full `npm run check` are not locally verified. Fresh exact-head CI must confirm the counts and normal register check before independent re-review; a discrepancy is a failed test, not a reason to adjust the expected counts without investigation.

Next: recover and judge the 17 before choosing a new rule. On fresh invented tuning and held-out cases, include same-line wrong subject/action/qualifier, not just wrong value; validate with the actual approved embedder before any private campaign. Keep N3–N5 held. No model run without approval, no long or all-core load on the Mac.
