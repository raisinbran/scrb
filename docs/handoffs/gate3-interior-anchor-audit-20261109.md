# D2 Interior Anchor Audit and Existing Clock-Rule Enforcement

Own worktree `C:/Users/bchen/Documents/GitHub/scrb-codex`, branch `codex/gate3-practice-marker-audit`, starting from published `cc7498ddd6159a633ad8bd39425fece4875932dc`.  No rebase, history rewrite, merge, amendment implementation, freeze, recording, playback, rendering, threshold change, protocol change, or source-audio mutation.

## External Evidence

All generated analysis outputs, numeric tables, full correlation traces, selected passage identifiers, fit/reference uncertainty components, historical/current marker frame diagnostics, scripts, and input SHA-256 manifests remain outside Git at:

`C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/practice-d2-codex-interior-audit-20261109/`

Read `final-report.md`, `interior-results.json`, and `reconciliation-and-anchors.json`.  `analysis-settings.json` records the diagnostic parameters before matching; these do not alter protocol acceptance or marker detection parameters.  Source WAV hashes match the playback log.  The original inputs were checked against the previous decode hashes; the new interior audit verified all 244 inputs unchanged before/after.  Additional reconciliation code/input hashes are preserved separately.  No practice audio, logs, measurement outputs, or hash manifests are copied into Git.

All six preselected source passages are 3 s long.  Passage selection used only source annotations/energy variation near the requested times.  Recorded searches stayed within the lead/trail prediction +/-1 s, preserving chronological occurrence locality.  No unrestricted repetition search.  Each anchor has a strong unique peak across the predeclared envelope methods; the external report records predicted/measured times, residual, peak/secondary NCC, width, and uncertainty.

Interior residuals challenge a straight-line clock assumption and are step-like after removal of the forced affine fit.  Three sparse anchors cannot distinguish a sharp step from a smooth bow conclusively.  Both tracks have independently logged gaps between the first two anchors; no causal clock diagnosis or new correction rule is asserted.

The microphone trailing timing difference was reproduced using the original chunks.  Sonnet's documented reconstruction and this audit's decoded marker windows are sample-identical.  Different forward window widths and purity criteria produce different qualifying-window LEFT edges; ordinary rounding does not account for it.  Both observations and their full union are preserved in reference prediction uncertainty.  This is feature-time sensitivity, not calibrated acoustic-onset confidence.  No favorable endpoint is selected.

## Confirmed Analyzer Bug and Fix

Under the current Protocol v3 clock rule, a missing or failed marker clock makes that track's latency INCONCLUSIVE.  Old `analyze-bounds.py` computed validity only when `fit_clock()` was called explicitly; main() ignored both that helper and clock evidence.  Synthetic CLI tests demonstrated Layer A PASS despite a failed clock and despite absent clock evidence.  Actual failing outputs are in external `clock-enforcement-before.txt`.

The fix changes only final-report gating under the EXISTING rule.  Input JSON supplies `clocks` keyed by microphone/meeting, containing independent clock reports (`valid`, `offset_disagreement_seconds`, optional `anchor_uncertainty_s`).  The CLI requires valid evidence and rechecks the finite nonnegative disagreement plus any supplied anchor uncertainty against the same 0.100 s limit.  It does not trust a stale true flag above the limit.  Missing or invalid clocks produce latency INCONCLUSIVE, recurrence INDETERMINATE, `bounds: null`, and preserve the eligible denominator count; no Layer A PASS/FAIL or hidden acceptance pass flags are emitted.  Valid clocks keep current latency/coverage/recurrence arithmetic unchanged.  The frozen-input requirement remains unchanged.

The arithmetic helper `summarize_track()` still computes endpoint bounds for unit testing; final CLI reports go through `analyze_track()` and clock gating.  This does not constitute authentication of an independently supplied report or introduce a new synchronization exception.  No practice annotation was frozen and no real practice acceptance report was generated.  This task does NOT implement or approve the proposed amendment.

Five focused regressions pass after the fix: invalid clock, missing clock, stale valid flag, uncertainty/current-rule enforcement, and unchanged valid-clock PASS/FAIL behavior.  Both initial invalid/missing-clock tests failed on old main() with PASS versus expected INCONCLUSIVE.  Before/after transcripts stay outside Git.  Full Python suite passed **96 tests** in 10.131 s.  `npm run check` passed type checks, ESLint, and Vitest (**819 passed, 63 skipped; 52 files passed, 6 skipped; 39.72 s**).  Existing Vite/CommonJS and Node localStorage warnings remain.  The boundary command skipped this branch naming pattern; changed-path review verifies only this handoff, incident register, bounds analyzer, and its new tests changed.  Whitespace checks passed before commit.  Python comment checker remains unavailable; independent review of this fix is pending before any merge.

## Incidents and Continuation

A-035 logs a failed cache-path assumption in this task's reconciliation script; the failed script was preserved externally and the corrected analysis reconstructs marker windows from original chunks.  A-036 logs the prior agent-created scoring bypass identified by this review.  The deliberate red regression run is requested defect evidence, not an accidental retry.

Continue with independent review of the current-rule gating change and the external anchor/marker report.  The owner must separately approve any amendment before implementation.  No inferred approval follows from these diagnostics.

## Last Observed Allowance and Publication

Last observation: 83% five-hour / 83% weekly remaining at 01:30 PT after all checks, before commit/push housekeeping and final reply.  This is not a guaranteed post-reply balance.  Same quota windows throughout this task.  Proposed tracker row below is not inserted into the shared tracker to avoid concurrent edits.

| Date (PT) | Agent / device | Task and outcome | Start time | Last observation | 5h left, start -> observed | Week left, start -> observed | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | Codex / Windows Desktop, own scrb-codex worktree | Independent bounded interior anchors and pulse reconciliation; reproduced/fixed current-rule CLI clock bypass; 96 Python tests and npm check passed | Initial read; exact PT time unavailable | 01:30 PT before commit/push | 91% -> 83% | 85% -> 83% | 8 / 2 | Analysis/fix/tests / GPT-6 (exact variant unavailable) / effort unavailable | 1 failed missing-cache setup corrected; intentional red CLI test is not a retry | pending independent review | get_usage_limits rateLimitsByLimitId.codex; 5h reset Nov 9 05:50:24 PT; week reset Nov 15 16:43:52 PT. Other account overlap unknown; observed deltas are not isolated task costs. |

Commit title: `fix: enforce current clock rule and audit interior timing`.  Normal push to `codex/gate3-practice-marker-audit` is owner-authorized.  No new publication branch, force-push, or history rewrite.  The SHA/publication result is supplied in chat.  Implementation of the proposed amendment remains prohibited pending owner approval and independent review.
