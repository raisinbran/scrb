# Protocol v3a timing mode — implementation handoff

## State and scope

Base `d21340c76fbbe4cde3de7aede31ba760e949d0f2`, fetched from the requested branch before work. Own detached worktree: `C:/Users/bchen/Documents/ChatGPT/srcb/v3a-code-worktree-20261109`. It was moved out of the original checkout after checks to leave that checkout clean. The existing `scrb-codex` branch worktree was not changed. Publish this HEAD with a normal explicit `HEAD:codex/gate3-practice-marker-audit` push; never force-push. Final SHA/publication outcome is reported in chat.

**Partial implementation, pending owner acceptance:** explicit `--mode v3a` is implemented; v3 stays the default. The supported validated matcher is unique exact long PCM only. Actual noisy microphone-step detection on the preserved practice recording is **not implemented or validated**. Prior feasibility correlations were expressly numerical candidates, with no validated matching/calibrated timing uncertainty. No new correlation threshold was invented and no actual recording was rescored. No capture/UI/contracts change, recording, playback, speech synthesis/rendering, freeze, gate approval or merge occurred. Fetch and normal push are the requested network exceptions; analysis/tests are offline.

## Changes

- `v3a_timing.py`: read original Opus embedded tags, native decoded counts, complete per-track inventory and source hashes; validate gap maps. Continuous view retains every decoded sample. Valid timestamped view places those samples with gaps. No numerical gap cutoff.
- `marker_clock.py`: explicit v3a continuous-view 100 ms check including anchor uncertainty, no affine correction, beside the original timestamped marker check. On post-decode count inconsistency, preserve the original v3 legacy adapter's measured marker result separately, with declared-end clipping confined to legacy reporting; invalidate v3a timestamped timing and all acceptance. Missing original evidence can make a measured original result unreconstructable; report that explicitly.
- `analyze-bounds.py`: explicit v3a evidence entry point, complete frozen source/scored ID and eligibility reconciliation, original denominator retention, earliest/latest speech-end intervals and last-word-start interval guard. Reuse Layer A's conservative earliest-end / best latest-end arithmetic. Validated adjacent long anchors bound significant offset changes; widen both directions by magnitude plus combined uncertainty, never correct offsets. Unsupported/unbounded matching/timing is INCONCLUSIVE.
- Gap crossing never changes eligibility or grants setup credit. SETUP-AFFECTED requires separate independently confirmed harness-failure evidence with a matching source hash.
- README documents CLI/schema, input adjudication obligations and matching limits. Source rates must match native recording rate; noisy/gain-altered or 24/48 kHz-mismatched evidence remains unsupported. Independent publication clock mapping and speech placements are input adjudication obligations, as original v3 acoustic endpoints were.

## Verification and independent review

Final Python suite: **119 passed**, 8.985 s. This includes all original 96 tests plus 23 new v3a tests. `npm run check` passed type checking, ESLint, Vitest **819 passed / 63 skipped**, 52 files passed / 6 skipped, 45.21 s Vitest duration. Existing Vite/CommonJS and localStorage warnings remain. The boundary script skips detached HEAD; changed-path inspection confirms offline backend scripts/tests and process documentation only. `git diff --check` passed after line-ending repair.

First v3a helper run had five duplicate-keyword errors; the first complete Python run exposed the isolated-runtime sibling import issue. Both were corrected with regressions. Initial npm check passed type/lint, then stopped before any tests ran because the shared dependency junction's Vite temp directory was not writable in the sandbox. The corrected-access npm check passed; no failed application tests or physical tests were repeated. All commands were planned below 20 minutes; actual suites took seconds/minutes.

Mandatory independent reviewer `/root/v3a_review` reviewed after checks, reproduced two issues (eligibility-label bypass reducing denominator and loss of original measured marker output), then verified both fixes after the 119-test pass. Follow-up result: **no further blocking findings in the supported exact-PCM path**. Actual noisy step validation remains unsupported. This is not owner acceptance, full v3a completion, Gate 3 approval or merge approval. Reviewer made no file changes or broad-suite reruns.

## New test coverage (test_v3a_timing.py)

| Test | Covers |
| --- | --- |
| measured_gaps_and_opposite_endpoints | 161/210 ms and 800 ms finite gaps, source IDs, all samples, correct conservative/best endpoints; no 250 ms cutoff |
| missing_duplicate_inconsistent_records | Missing count/chunk, duplicated chunk, timestamp/count/sequence inconsistency rejected |
| initial_and_multiple_gaps | Initial plus interior cumulative gap and exact-boundary placement |
| ogg_tags_duplicate_and_missing | Embedded tag parsing rejects duplicate or missing records |
| native_decode_keeps_every_sample_and_validates_inventory | Native mono adapter, exact sample preservation, timestamp placeholders, no resampling/channel remap; index/count errors |
| both_views_preserve_original_failure | Continuous v3a validity beside original timestamped INCONCLUSIVE at 161/210 ms; no v3a slope |
| same_limit_includes_anchor_uncertainty | Original 100 ms limit includes anchor uncertainty |
| invalid_counts_retain_original_measured_marker_result | Invalid gap map cannot PASS; retain measured original 210 ms discrepancy and markers |
| invalid_gap_records_cannot_pass_marker_mode | Missing/duplicate/inconsistent adapter evidence cannot yield marker acceptance |
| eighty_ms_step_widens_both_directions | Positive and negative 80 ms changes widen end/start intervals symmetrically |
| favorable_only_widening_cannot_create_pass | Favorable best-case widening cannot manufacture conservative PASS at median boundary |
| unbounded_or_unvalidated_step_is_rejected | Missing, reversed, unvalidated anchors and uncovered units fail closed |
| next_anchor_limits_widening | Step uncertainty ends at the next bracketing anchor |
| detects_step_from_actual_long_matches | Invented recording's 80 ms step measured with actual exact long matcher, finite bracketing interval and uncertainty |
| complete_inventory_prevents_skipping_immediate_long_neighbor | All source long IDs required, source hash bound, no selective brackets |
| unique_exact_long_match_and_negative_controls | Unique long match; reject short-word matching, ambiguity and a one-sample mismatch |
| crossing_gap_near_six_seconds_keeps_denominator | Gap-crossing units stay eligible near six seconds, opposing coverage bounds, original result retained |
| last_word_start_interval_prevents_false_presence | Publication within uncertain last-word-start interval cannot receive speech/pre-speech credit |
| gap_never_grants_setup_or_exclusion | Gap evidence supplies neither SETUP-AFFECTED nor eligibility exclusion |
| frozen_denominator_cannot_be_bypassed_by_labels_or_omission | Reviewer reproduction, omissions and duplicate scored IDs cannot reduce frozen denominator |
| missing_v3a_evidence_never_passes | Missing explicit v3a evidence stays INCONCLUSIVE |
| cli_mode_is_explicit_and_defaults_to_v3 | Default CLI exactly equals explicit v3; v3a selection does not inherit passing v3 clock |
| default_v3_behavior_remains_separate | Existing arithmetic PASS and original marker-disagreement rejection unchanged |

`test_cli.py` also checks both changed CLI help entry points in isolated Python; the scoring CLI regression executes real default/v3/v3a commands.

## Incidents and usage

A-039 is entered in the incident register: inspection/path/access errors, faulty invented-unit helper, isolated import error, dependency-cache startup failure, documentation encoding/line-ending mistakes, and the two reviewer-detected scoring/reporting errors. All corrections were made before publication; no application failure, actual recording score, gate credit or private-evidence change resulted. Original register content was restored byte-faithfully through newline normalization before adding the new UTF-8 entry. No exact quota cost is attributed to any error.

Parent start: **99% five-hour / 79% weekly remaining**, approximately 08:17 PT November 9. Last observed before publication: **85% / 76% at 08:36 PT**. Same windows, observed account decreases 14/3 percentage points; not isolated task costs. Five-hour reset Nov 9 **13:20:11 PT**, weekly reset Nov 15 **16:43:52 PT**. Source: `get_usage_limits.rateLimitsByLimitId.codex`. Exact model variant/effort unavailable; Codex/GPT-6, Windows Desktop. Shared account includes the mandatory reviewer; other overlap unknown.

Reviewer observations: initial review approximately 08:30–08:32 PT, **90% -> 89% five-hour; 77% -> 77% weekly**. Follow-up approximately 08:35 PT, **86% -> 86%; 77% -> 77%**. These overlap parent work; do not sum as separate costs. Reviewer reports no mistakes. Main and review rows are entered in `agents/agent_task_allocation.md` on this owner-authorized branch.

## Continuation

Review the published commit and the disclosed unsupported functionality. The exact-PCM mode and regression implementation are reviewable, but the actual preserved microphone step remains unvalidated. A calibrated/independently validated noisy long-utterance matcher (and a justified source-rate comparison method) is still needed to implement that remaining requirement. Do not substitute earlier numerical peaks, invent favorable uncertainty, waive inconsistent sample records, rerun physical tests, freeze evidence, or claim full v3a/Gate 3 acceptance from this commit. No follow-on work or merge is authorized by this handoff.
