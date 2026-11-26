# Agenda-to-notes N1 pilot: replay-only evidence

**2026-11-25 | Dev-only | Plan: [agenda-to-meeting-notes](../plans/agenda-to-meeting-notes-20261125.md) section 4, slice N1.** No IPC, UI, storage, contracts or Electron changes. Invented data only (no owner recordings, agendas or notes).

## What was built (`packages/outline/eval/model-test/`)

- `agenda.ts`: stable topic IDs and levels from `parseOutline`; agenda-aware prompt; atomic facts (decision, info, caveat, date, action, question) with 1-based line citations; per-fact verification (topic id exists, citation in range and inside its chunk, every number/date in the fact appears in the cited lines, owner appears in the cited lines, negation polarity agrees, minimum stem overlap); cross-chunk exact de-duplication; deterministic Markdown (agenda order and levels, "No discussion found" only when processing completed, new topics last); scoring of decision recall, date recall, hallucination rate, valid-citation rate and normalized edit distance (insert + delete + move + substitute over reference facts).
- `agenda-fixture.ts`: one invented 16-line meeting, 11 reference facts (includes a superseded value, a negated decision, a conditional date and an off-agenda topic), plus a faithful and a deliberately flawed scripted output.
- `agenda-replay.ts` (`npx tsx eval/model-test/agenda-replay.ts` from `packages/outline`) and `test/model-test/agenda.test.ts` (6 tests).

## Model comparison: not run

No local LLM is installed on this Mac: no `llama-server`, Ollama or LM Studio, and no instruction GGUF (the Scribe models folder holds only Whisper and diarization files). Per the plan, no download was attempted and the comparison was stopped. **Everything below is scorer and pipeline validation with scripted backends, not model evidence, and says nothing about whether a 7-8B model can do the task.**

## Replay numbers (one invented meeting, so these are illustrative)

| Scripted output | Decision recall | Date recall | Hallucination | Valid citations | Normalized edit distance |
| --- | ---: | ---: | ---: | ---: | ---: |
| Agenda-aware, faithful | 3/3 | 2/2 | 0/11 | 11/11 | 0.00 |
| Agenda-aware, flawed | 0/3 | 1/2 | 4/10 (40%) | 9/10 | 1.09 (6 ins, 5 del, 1 move) |
| Unstructured baseline (12 transcript lines filed under one topic) | 2/3 | 1/2 | 0/12 | 12/12 | 1.27 (2 ins, 3 del, 9 move) |

The flawed output plants an invented date, a polarity flip, an invented topic id, an out-of-range citation, a stale superseded value, a wrong-topic placement and a duplicate; the scorer flagged each as intended (asserted in the test). The faithful-versus-baseline delta (edit distance 0.00 vs 1.27) shows only that the scorer separates structured, placed notes from an echo; the baseline was written by hand.

## Scorer defects found (not fixed; fix in N2 before any model number is trusted)

1. **Echoed transcript lines earn decision/date credit.** The baseline, which copies lines verbatim as `info`, scores 2/3 decision recall because matching ignores `kind`. Require kind agreement for decision, action and question, or score kind separately.
2. **Matching is lexical** (stem F1 >= 0.4 plus exact value tokens). Paraphrase is under-credited and near-verbatim copying over-credited. N2 needs the embedding path from `taskA.ts` (`matchPoints`, contradiction and duplicate statuses), not this stand-in.
3. **Hallucination counts only verification failures** (bad topic or citation, unsupported value/owner, polarity flip). A well-cited but wrong-meaning claim, or a stale value that the transcript later reverses, passes verification; it surfaces only as a missed reference decision. Supersession checks are not implemented.
4. **Negation check is a single boolean per span**, so a span holding both a negated and an affirmed clause can falsely contradict or falsely pass.
5. **Dedup is exact-text only**; paraphrased repeats across chunks stay and count as deletions in edit distance.
6. **Word edit distance, accept/reject/move/undo counts and owner review time** from plan section 3 are not computed; the fixture is one chunk so cross-chunk behaviour is untested.
7. Existing `promptHash` and manifest do not cover the new prompt.

## Recommended next experiment

Get one owner-approved installable 7-8B instruction GGUF with a local llama.cpp server (the plan's open model approval), then run existing Task A prompt vs `promptAgenda` on 3-4 invented meetings of 200+ lines each (include two AMI transcripts with invented agendas, since AMI has no agenda-and-notes gold), within the 20-minute budget, after fixing defects 1-2. Report decision/date recall, hallucination and edit distance per meeting with counts; continue only if both prompts return parseable JSON with valid topic ids on at least 90% of chunks.
