# V-d — Gate 6 summary recall diagnosis (2026-11-26)

**V1 cell V10 | Existing evidence only | Diagnosis and proposed experiment, not implementation or acceptance.**

## Evidence and scope

Source inspected: `bc731e263220307c106edf64987c552041339796`. The controlling baseline is PR #196's held-out score preserved in [score.json](../gates/gate-6/score.json), corroborated by [score.txt](../gates/gate-6/score.txt), [summary evaluation](../gates/gate-6-summary-eval.md) and [recall investigation](../gates/gate-6-summary-recall.md), particularly its 13-miss cause table. These are public AMI fixtures, not owner recordings. No transcript, reference sentence, extracted item or summary text is reproduced here. No new model call, scoring execution, private-data access or code edit occurred.

| Meeting | Reference items | Recovered | Missed |
| --- | ---: | ---: | ---: |
| IS1004d | 12 | 5 | 7 |
| ES2015c | 13 | 11 | 2 |
| TS3005b | 15 | 11 | 4 |
| Total | 40 | 27 | 13 |

Baseline recall is exactly 67.5% (reported rounded as 68%); the 80% gate requires 32/40, five net additional recoveries. The matching rule is at least 50% of reference stemmed content words in any one output action or decision, with both kinds pooled. It is not an independent semantic judgment. Two documented scoring artifacts would raise a hypothetical semantic-adjusted count to 29/40 (72.5%), not change the frozen score. The earlier hand-judged 78% held-out result is a different measure. Structural links passed 189/189 primary and 33/33 secondary; true precision remains unknown (self-judged 54/171, reference-matched 81/171).

## Item classification

Numbering is global, one-based, in the exact order of the three `missed` arrays in the preserved score.json: 1–7 IS1004d, 8–9 ES2015c, 10–13 TS3005b. This is a stable pointer to each item without reproducing its contents.

| Item | Category |
| ---: | --- |
| 1 | prompt wording |
| 2 | duplicate removal |
| 3 | prompt wording |
| 4 | prompt wording |
| 5 | prompt wording |
| 6 | prompt wording |
| 7 | prompt wording |
| 8 | prompt wording |
| 9 | prompt wording |
| 10 | prompt wording |
| 11 | scorer mismatch |
| 12 | scorer mismatch |
| 13 | prompt wording |

| Category | Count |
| --- | ---: |
| chunking boundary | 0 |
| ranking cutoff | 0 |
| prompt wording | 10 |
| model capacity | 0 |
| duplicate removal | 1 |
| scorer mismatch | 2 |
| Total | 13 |

**Attribution limits:** These are mutually exclusive **provisional diagnostic categories**, not 13 independently proved causal mechanisms. The prior investigation records eight non-extractions, two stale states, one bundled item and two matching-rule artifacts. The eight omissions and two stale-state misses are assigned to prompt wording as the first testable hypothesis; the bundled item is provisionally assigned to duplicate removal. Only the two scorer mismatches have specific matching-rule evidence (33% and 45% overlap respectively for items 12 and 11). No per-item pre-dedupe request/response trace was located in the committed Gate 6 evidence. In particular, a bundled item does not prove that the dedupe function deleted it, and an omission does not prove that the model never emitted it before validation. The 11 provisional assignments require that trace or a controlled test for confirmation. Zero assignments to the other categories means no specific item can be attributed to those mechanisms with the available evidence, not that they were ruled out.

## Why test wording first

- `packages/summary/src/prompts.ts:44–55`: the existing settled-coverage prompt seeks a narrow set of decisions and explicitly prioritizes only the most important few. Small but independently supported decisions can therefore be omitted or bundled. `src/schema.ts:71–95` also caps each coverage list at six; the available evidence does not establish which windows actually hit that cap.
- `src/extract.ts:42,217–261,293–319` uses primary sections of 16,000 characters, coverage windows of 8,000, 600-character overlap, item filtering/evidence checking and dedupe. It sorts the surviving items by time, rather than applying a final relevance ranking cutoff. No saved item-level boundary or rejection evidence isolates a chunking or ranking cause here.
- `src/dedupe.ts:54–97` chooses the better-supported or more specific duplicate and flags conflicts without resolving them. Wording can improve how a window expresses a revision, but cannot guarantee reconciliation across windows. Existing source notes document a failed extra specifics pass (held-out 26/40 versus 27/40) and removed unsafe reconcile/cap experiments. Do not repeat those experiments or reinterpret their results as evidence of a working fix.
- Model capacity remains a competing hypothesis; one model and these saved results cannot establish it. The proposed experiment keeps model capacity, chunking, schema, token budget, evidence checks, dedupe and scorer unchanged.

## One proposed change

In `packages/summary/src/prompts.ts`, replace only the importance-prioritization sentence emitted by `coverageSystem` for the existing `coverage-settled` focus. Leave the next-steps focus and primary prompt exactly unchanged. Proposed replacement:

> Use the available slots for distinct supported settled choices, including small confirmed details, explicit exclusions and stated conditions. Write one independent decision per item. Within this window, report the latest explicitly supported state when a decision is revised. Return an empty list when no qualifying decisions are present.

This is newly proposed instruction text, not fixture content. Retain the six-item cap, existing evidence and uncertainty rules, all other prompt text, and the same number of inference requests. No new pass or cross-window override. Expected effect: improve recovery of atomic and lower-salience settled decisions, and possibly revisions contained within one window. This is a hypothesis, not a predicted measured score. Pilot signal: recover at least two of the seven IS1004d misses without losing its five existing matches. Cohort success against the frozen baseline requires at least five net additional recoveries (32/40); no increase in unsupported or duplicate output is acceptable as a substitute for recall.

## Exact proposed held-out comparison — requires new approval

**Do not execute as part of this task.** The original complete extraction cost 820 + 906 + 880 = 2,606 s (43m 26s), before setup and verification. A full paired re-extraction would be about 87 minutes of model time at those historical Mac rates alone. Prior cached experiments report about 4–5 minutes per meeting for an additional coverage pass, but neither that nor the Mac rates establish Regiurn timing. The three meetings have now been inspected for diagnosis; they are a fixed regression cohort, no longer an untouched holdout for the proposed wording. Do not tune further on them or call the result independent generalization evidence.

**Request: authorize one cache-controlled A/B comparison on REGIURN, up to 60 minutes total including preflight, preparation, inference, scoring, validation and cleanup.** Budget estimate only: 10 minutes preflight/preparation, 24–30 minutes for two settled-focus passes across the three meetings if the saved-response rate transfers, 10 minutes for scoring/evidence review and 5 minutes cleanup; 49–55 minutes total. Stop before starting inference if the verified budget cannot fit. No repeated whole-pipeline runs, model download, private corpus, self-judge run or extra tuning cycle is included. If the prerequisites fail or an extension would be material, return BLOCKED and request a revised budget; do not substitute a different model or silently start a fresh full extraction.

1. Preflight: use one isolated worktree of the inspected source and one of the same source with the single proposed wording change, only after independent review and owner approval. Verify the original public AMI fixtures and references for IS1004d, ES2015c and TS3005b (40 total, same order), the existing baseline saved extraction and request recordings, full fixture/model hashes and source identity. The original judge receipt gives saved-extraction hashes and a model hash prefix, not a complete model manifest. Confirm the identical Qwen3.5-9B Q4_K_M model and compatible llama-server are already available on REGIURN, verify the actual backend/executable/settings, exclusive model access and enough time; no assumption that the Mac shell wrapper or asset layout runs on Windows.
2. Freeze the current code/scorer and record both prompt identities, fixture hashes, complete model hash, backend/runtime, sampling and run settings. Use `sectionChars=16000`, `coverageChars=8000`, `overlapChars=600`, `maxTokens=4096`, and no narratives. Verify that unchanged primary and next-steps answers replay the original request keys. Use the local `RecordingLlm`/requestKey mechanism in `packages/summary/eval/record.ts`: clone only the exact unchanged primary and next-steps cached responses to separate A/B output directories; exclude all settled-focus keys in both so they run afresh on the same host. Preserve every original recording. Use `ReplayLlm` to verify the full original cache and baseline first without inference. A local preflight must demonstrate which keys are retained/excluded and prevent unexpected live requests in the unchanged passes; the existing CLI has no selective-cache switch. If this cannot be guaranteed with the available local evaluation tooling, stop and arrange a separately reviewed local helper; do not run this experiment as if the CLI already provides that guarantee.
3. Run A (original settled prompt) and B (candidate settled prompt), each once for the same three meetings, one meeting process at a time with the same validated runtime and separate output/cache directories. In each prepared worktree from `packages/summary`, the existing extraction command per meeting is:

   ```text
   node dist/eval/run.js <public-fixtures-dir> <A-or-B-output-dir> <meeting-id> --section-chars 16000 --coverage-chars 8000 --no-narrative
   ```

   Build the package first (`npm run build`) using the existing dependency environment. Set `SCRB_DEV_ASSETS` to the verified local assets directory and use a supported Windows model-lock/launcher arrangement; the existing shell script is Mac-specific. Do not start if runtime compatibility or cache controls are unverified. Count actual requests, retries, cache hits/misses and elapsed time. No concurrent inference runs.
4. Score saved outputs from each arm with the unchanged deterministic scorer; no judge flag, no additional inference:

   ```text
   node dist/eval/gate6.js <public-fixtures-dir> <A-output-dir> IS1004d ES2015c TS3005b --json <local-A-score.json>
   node dist/eval/gate6.js <public-fixtures-dir> <B-output-dir> IS1004d ES2015c TS3005b --json <local-B-score.json>
   ```

   Verify 40 reference items, baseline identity, each meeting's recall, all original 13 numbered misses, recovered/lost items and net change, output counts, reference-matched precision and all primary/secondary structural links. Use the same 50% rule; do not alter the scorer or award the two artifacts credit selectively. Compare A against B for the prompt effect; compare both against 27/40 for historical regression, not as a controlled hardware-independent comparison. If A differs from the historical baseline, report that explicitly. In the allowed verification budget, independently inspect changed/recovered items for supported meaning, stale state and duplicates using public fixtures only; report counts by item ID and category, no text. A higher recall with materially more unsupported items is not success. If full semantic review cannot fit, mark precision NOT VERIFIED.
5. Report only numeric/category evidence, manifest hashes and timing. Keep all request recordings, transcripts, generated summaries, judge sheets and scorer JSON (which contains reference text) in isolated local directories outside Git. No text or paraphrases in chat/PR. Preserve evidence; stop the owned worker and clean only disposable scratch under the existing retention rules. No installed-V1 or Gate 6 PASS is implied even if recall crosses 80%.

**Gate:** diagnosis complete at the available evidence level; one proposed change pending independent review, explicit owner approval of its implementation and the 60-minute REGIURN comparison, and verified local prerequisites. No run or merge is authorized by publishing this note.
