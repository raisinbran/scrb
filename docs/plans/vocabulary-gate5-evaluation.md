# Plan: vocabulary recognition-benefit evaluation (Gate 5)

**Status:** Draft, **independent review pending** (ChatGPT). Docs only; nothing run, no model invoked, no audio touched.
**Date/base:** 2026-11-12, `origin/main` `dcb04f8`.
**Owner decision:** owner approved the evaluation proceeding in two stages on 2026-11-12. **Each stage still needs its own go-ahead before it starts** (both exceed 20 minutes; see the test-duration rule in `AGENTS.md`).
**Question:** [vocabulary-rules.md](vocabulary-rules.md) Gate 5: learned terms improve recognition with **fewer than 1 false replacement per audio hour**, using "several hours of negative controls" (row "False substitutions"). Gate 0's invented-term result is not a pass.

## How hints reach recognition (read from code at `dcb04f8`)

- **Terms:** enabled rows of `vocabulary_terms` (`enabledTerms()`, `packages/storage/src/db/vocabulary.ts:382`, newest first, limit 200). Suggestions (`vocabulary-suggestions.ts`: at least 3 corrections in at least 2 meetings) become terms only when the user accepts them.
- **Hint:** `vocabularyHint(terms)` (`packages/app-core/src/vocabulary-hints.ts`): NFC, deduplicated, comma-joined, at most 40 terms and 512 characters. It **never substitutes text**.
- **Switch:** `vocabularyHint` option of the final pass or import (`final-pass.ts:253`, `importFile.ts:172`) becomes `prompt` in `wholeFileArgs` (`whisper.ts:58`), i.e. whisper-cli `--prompt <hint> --carry-initial-prompt`. **Hints off = the same arguments without those two flags** (no term list). Everything else (model, `-t`, VAD, `-mc 0`) identical.
- **Path covered:** offline final pass / import (whisper-cli). The live whisper-server path has no hint and is out of scope.
- **False replacement (operational):** hints cannot rewrite text, so it is a recognition error caused by the hint: a learned term appears in the hint-on output where the reference says something else. Counted two ways: (a) **negative controls:** every occurrence of a learned term (case-insensitive whole word or phrase) in hint-on output is one event, because the reference contains none; (b) **held-out meeting:** a learned term in hint-on output aligned to a different reference word, and absent at that place in hint-off output. Rate = events / audio hours decoded with hints on.

## Fixtures (AMI only; never the owner's recordings)

- **Held-out meeting:** `TS3003a.Mix-Headset.wav` (25.1 min, local at `~/scrb-dev-assets/downloads/ami/`). Not used to choose anything except the terms below.
- **References:** AMI manual word files in `~/scrb-dev-assets/downloads/ami/ann/words/` (local).
- **Negative controls (about 3.2 audio-hours):** only ES2004a (17.5 min) and IS1009a (14.0 min) are local in addition, so about 2.5 hours must come from **other AMI meetings not yet downloaded**. Their identities and download size are **unverified**; downloading needs owner OK (state filenames, source, size first). Pick meetings whose reference words contain none of the terms; stop at 3.2 h or report the shortfall.
- **Terms:** 10 to 20 phrases that appear at least twice in the TS3003a reference and that hint-off output got wrong at least twice (mirrors what a user would correct). Terms are fixed before any hint-on run and recorded.
- **Models:** `ggml-large-v3-turbo-q5_0.bin` and `ggml-silero-v6.2.0.bin` in `~/scrb-dev-assets/models/whisper/`; binary `~/scrb-dev-assets/upstream/whisper.cpp/build/bin/whisper-cli`. Whether turbo is what the app's final pass uses is **unverified**.

## Stage 1 (answers Gate 5)

1. Preflight, read-only: confirm files, durations and the models above exist; record `git rev-parse HEAD`, whisper.cpp commit, thread count.
2. After owner OK, download extra AMI negative-control audio and references into `~/scrb-dev-assets/eval-vocab/` (outside git).
3. Hint-off run on TS3003a:
   `whisper-cli` with `wholeFileArgs` output (`-ojf`), writing `off/TS3003a.json`.
4. Choose terms from step 3 vs the reference; write `terms.json`; load them as enabled terms in a scratch library (not the owner's) and build the hint with `vocabularyHint(enabledTerms())`; save the hint text.
5. Hint-on run on TS3003a (same args plus `--prompt <hint> --carry-initial-prompt`).
6. Hint-on run over every negative-control file.
7. Score with one small offline script (written at that time under `scripts/research/`, reviewed before use): normalized word alignment (lowercase, no punctuation); term recall off vs on; WER off vs on; false replacements per audio hour.
8. Write `results.md` with the table below, then stop. No audio is ever played: offline file decoding only, Mac speakers stay silent.

**Expected wall-clock (all unverified):** decoding about 3.2 h negatives + 2 x 0.42 h held-out = about 4.0 audio-hours. Earlier estimate in the owner brief for Stage 2 is 5.6 to 30 h compute for about 22 audio-hours (0.25 to 1.4 x real time; original source not found in repo, `agents/` or `/Users/brandonchen/Documents/ChatGPT/`), which scales to **about 1 to 5.5 h** for Stage 1 decoding. Add about 1 h setup/download and 0.5 h scoring/cleanup: **roughly 2.5 to 7 h, over the 20-minute limit.** Estimate includes setup, transcription and cleanup. Re-measure after the first file and tell the owner if it is materially higher.

## Stage 2 (only if Stage 1 is inconclusive or the owner asks)

About 22 audio-hours (more AMI meetings, more held-out meetings and term sets), estimated 5.6 to 30 h compute (unverified). Needs its own plan note, review and go-ahead; do not start from this document alone.

## Pass/fail (about 3.6 audio-hours with hints on)

| Result | Condition | Outcome |
| --- | --- | --- |
| Recognition improves | Term recall on > off **and** WER on <= off (Gate 5 gives no numeric margin; owner/reviewer may set one) | Required for pass |
| Zero false replacements | 0 events in about 3.6 h (95% upper bound about 0.8 per hour, rule of three) | **Gate 5 vocabulary criterion met** (with the line above) |
| Inconclusive | 1 to 3 events (point rate under 1 but upper bound over 1), or improvement within noise | Report; Stage 2 only on owner decision |
| Fail | 4 or more events (rate about 1.1 or more per hour), or WER worse, or recall not higher | Gate 5 vocabulary criterion not met; hints stay on, no automatic fixer |

The other Gate 5 criterion (100% corrections survive restarts and final passes, task #1) is outside this plan. Single meeting and one term set: a pass shows benefit on this evidence, not in general; say so in the report.

## Stopping rules, retention, logging

- Do not automatically rerun a failed or inconclusive run; report, and let the owner decide. A tool error before any output (for example a missing file) may be fixed and the same step started once, logged.
- Keep all raw outputs (`off/`, `on/`, negatives, `terms.json`, hint text, scorer output, command log) in `~/scrb-dev-assets/eval-vocab/` and a copy of the summary under `/Users/brandonchen/Documents/ChatGPT/srcb/`. **Do not delete after a pass**; cleanup only on the owner's explicit instruction (evidence-retention policy).
- Record usage per `agents/agent_task_allocation.md`; log any agent mistake in `agents/agent_self_induced_failures.md`.

## Unverified

Extra AMI meeting names/size/availability; decoding speed (RTF) and the 5.6 to 30 h source; whether turbo is the app's final-pass model; run-to-run determinism of whisper (single run each); numeric "improvement" margin; whether 10 to 20 terms are a representative learned set; scratch-library setup for `enabledTerms()` not tried.
