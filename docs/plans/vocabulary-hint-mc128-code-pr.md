# Plan: enable the vocabulary hint with `-mc 128` (code PR)

Owner decision (2026-11-12): proceed with `-mc 128` for hinted decodes. Basis: `docs/plans/vocabulary-hint-context-fix.md` (reviewed, merged) and `docs/gates/vocab-mc-test-results-20261112.md` (PR #121). Risky change under `AGENTS.md` (changes shipped recognition arguments): **no code before ChatGPT review of this plan and owner approval.**

## What the evidence supports, and what it does not

- Held-out TS3003a: recall 8 to 16 of 30, WER 23.91% to 23.05%.
- Costs the owner accepts by choosing this: ES2003c WER 1.9 points worse; one wrong held-out word ("waterproof"); 2 benign negative-control events (spelling forms). The plan's table calls this **inconclusive**, not a pass.
- It is **not** a Gate 5 pass: one meeting, one 10-term set. Gate 5 stays open; Stage 2 remains an owner decision.

## Change

1. `packages/transcription/src/whisper.ts`, `wholeFileArgs` only: `-mc 0` when `o.prompt` is empty, `-mc 128` when it is set. One named constant (`HINTED_MAX_CONTEXT = 128`) so reverting is one line. Hint-less meetings and meetings with no learned terms are byte-for-byte unchanged.
2. Not touched: the live whisper-server path (`whisper.ts:194`, no hint there), `finalPass.ts:89` (the only call site passing `prompt`), contracts, Electron settings, UI.
3. Comments/docs: replace the stale comment on `prompt` (`whisper.ts:21`) and the `-mc 0` row in `packages/transcription/README.md:33` with the measured facts (hint works only with `-mc` above 0; `-mc 0` kept without a hint because its original reason is unverified; evidence note path). Add a "hints now affect the offline final pass and imports; unproven beyond one meeting" line to `docs/plans/vocabulary-rules.md` status.

## Tests

- Extend `packages/transcription/test/parsing.test.ts`: no prompt gives `-mc 0` and no `--carry-initial-prompt` (existing assertion stays); with prompt gives `-mc 128`, `--carry-initial-prompt`, and no `-mc 0`; the argument after `-mc` is exactly `128`.
- Mutation check: set the constant to 0 and confirm the new test fails.
- `npm run check`. No decode run is needed; the measured behavior is in the results note.

## Rollback and watch

Set the constant to 0 (hint becomes inert again, as shipped before). A hinted meeting that shows repeated phrases or a clear WER drop is the signal to revert; there is no automatic detector in this change (out of scope).

## Process

Branch `cuc/` from `main`; PR with the diff and test output; automated checks first; ChatGPT independent code review before merge; no merge without the owner. Record the usage row and any agent error in the agents register.
