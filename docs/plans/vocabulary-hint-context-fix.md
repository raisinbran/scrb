# Plan: make vocabulary hints take effect in the offline final pass and import

Status: draft, independent review (ChatGPT) and owner approval pending. Date: 2026-11-12. No code is changed by this document.

## Problem (measured)

`wholeFileArgs` (`packages/transcription/src/whisper.ts:46`) always passes `-mc 0`. With whisper.cpp `284029c` that makes `--prompt <hint> --carry-initial-prompt` a no-op, so the shipped hint does nothing in the offline final pass and import. Evidence: Gate 5 stage 1 (`docs/gates/vocab-gate5-stage1-results-20261112.md`, PR #118) found hint-on output word-for-word identical to hint-off (recall 8/30 both, WER 23.91% both). One controlled TS3003a run at `-mc 128` made the hint matter: recall 12/30 to 16/30, WER 23.32% to 23.05%, 0 held-out false replacements. **Not measured:** negative controls at `-mc 128`; any non-zero `-mc` on hint-less audio; other term sets or meetings.

## Why `-mc 0` is there

The code comment (`whisper.ts:28-29`) says the "proven final-pass settings" use no text conditioning "without which turbo loops or skips". So the reason is recorded but **unverified here**: no evidence file or test behind it was found (`git log` shows it set in the first transcription commit `7a04512`, no message detail). Treat it as a real risk: `-mc` above 0 lets decoded text condition later windows.

## The change (smallest safe)

In `wholeFileArgs` only: push `-mc 0` when `o.prompt` is empty; push `-mc <N>` (bounded, N chosen below) when a prompt is given. Nothing else changes.

- Touches: offline final pass and import (both call `wholeFileArgs`; verify the two call sites pass `vocabularyHint` as `prompt`).
- Does not touch: the live whisper-server path (`whisper.ts:194`). It has no hint today; adding one is a separate decision. Hint-less meetings and meetings with no learned terms are byte-for-byte unchanged, which removes the hint-less regression risk by construction.
- Rejected: changing the default to non-zero for everyone (unproven loop/skip risk on all audio, no benefit without a hint).
- Update the stale comment on `prompt` and the `-mc 0` note in `packages/transcription/README.md:33`.

## Value of N

Test **64 and 128**; pick the smaller one that keeps the recall gain with no new false replacements or loops. 128 is the measured value (whisper's default is a large context, so 128 is the tested point); 64 bounds how far a wrong word can carry. Anything under the hint length (~109 chars, ~30 tokens) would be pointless, so 64 is the floor.

## Test plan (offline AMI only, no audio played, no owner recordings)

Inputs: `~/scrb-dev-assets/eval-vocab/` (`terms.json`, `hint.txt`, `neg/`, `downloads/ami/` ES2004a and IS1009a, TS3003a). Scorer: `scripts/research/score_vocab_eval.py` (on the PR #118 branch; confirm it is merged or use that branch). Same whisper-cli command as stage 1 except `-mc`.

1. **Negative controls with hint on**, 7 files, 3.643 audio-hours (the negative controls alone; 4.062 h with the 0.419 h held-out meeting), at 64 and at 128 (about 5.5 min each at ~63x real time). Count false replacements per audio hour. Gate 5 needs under 1 per hour; the stage-1 table passes only on 0 events (1 to 3 is inconclusive, 4 or more fails). Add a **loop/skip check** against the existing `-mc 0` outputs (`neg_on/`, identical to hint-off): per file, word count ratio, longest repeated n-gram run, and WER versus the reference. Flag any file with a repeated phrase of 4+ words 3+ times that the baseline lacks, or WER worse by more than 1 point absolute (a reviewer-adjustable threshold).
2. **Held-out TS3003a** at 64 and 128: recall, WER, held-out false replacements (rerun for 64; 128 already exists but gets scored in the same batch for a clean comparison).
3. **Hint-less `-mc 0` vs chosen `-mc`** on two files (ES2004a, IS1009a, about 1 min each). Only a diagnostic: the shipped design never runs hint-less at non-zero `-mc`. It shows whether the loop risk is general or hint-driven, and decides whether the default could ever change.
4. **Unit test** in `packages/transcription/test/parsing.test.ts`: without prompt the args contain `-mc 0`; with prompt they contain `-mc <N>` and `--carry-initial-prompt` and no `-mc 0`. The existing assertion at line 13 stays for the no-prompt case. Then `npm run check`.

## Cost, time, rules

- Decoding: 2 values x about 4.5 audio-hours is about 12 min, plus diagnostics about 3 min, so about 15 min of decoding. With setup, scoring and writing up, estimate 30 to 40 min total. **The 20-minute test rule applies to the whole test, so the owner must approve before starting** (offer `pde-pr-approve` at once). Running the 64 and 128 runs in parallel would shorten it but is unverified for CPU/GPU contention and would distort timing only, not output.
- Stopping rules: run each decode once; **no automatic reruns**, including after a failure or inconclusive result. Stop on the first loop/skip flag or any false replacement and report; do not tune the threshold or terms afterward. Stop if a decode takes over 3x its expected time.
- Evidence: keep every output under `eval-vocab/` (new dirs `mc64/`, `mc128/`, `mcdiag/`), the command log and score files; delete nothing. Write results to `docs/gates/`.
- Usage logging: record the row in `agents/agent_task_allocation.md` with 5h/weekly remaining at start and end.

## Decision rules

- Ship the bounded `-mc` only if: negatives show 0 false replacements, no loop/skip flag, held-out recall higher and WER not worse. 1 to 3 events or an unclear loop flag: inconclusive, owner decides. Otherwise leave `-mc 0` and mark hints inert in the UI and docs.
- Even a pass is **one meeting (TS3003a) and one 10-term set**. It does not prove Gate 5 generally; Stage 2 (more meetings and term sets) stays an owner decision. Other whisper.cpp versions, the model other than turbo q5_0, and number-format scoring remain unverified.

## Governance

This changes shipped recognition arguments, so it is a risky change under `AGENTS.md`: **no code change before (1) ChatGPT independent review of this plan and (2) owner approval.** Code goes in a separate PR on a `cuc/` branch after approval, then automated checks, then independent code review before merge.

## Proposed usage row (this planning task)

Claude Code / Sonnet 5.5 / Mac desktop; plan only, no decode run; 5h used 15% at start (85% left), weekly used 74% (26% left); end 15% used (85% left), weekly 74% (26% left), no visible movement; reset 2026-11-13 02:20 UTC / 13:00 UTC; overlapping sessions running, so the decrease is not exclusive.
