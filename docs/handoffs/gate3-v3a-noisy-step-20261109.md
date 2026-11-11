# Protocol v3a noisy long-utterance step detector

## Assignment and current state

Base `cd02cc4af1954bcadbaa130ad4bc1b32a642ba87`; `git pull --ff-only origin codex/gate3-practice-marker-audit` confirmed up to date before work. Own detached worktree: `C:/Users/bchen/Documents/ChatGPT/srcb/v3a-code-worktree-20261109`. Publish with normal `HEAD:codex/gate3-practice-marker-audit`; no force-push. Final commit/publication is reported in chat.

Scope: offline v3a long-utterance step detection, regressions and documentation. Original v3 stays default and unchanged. No recording, playback, speech synthesis/rendering, capture/product/UI/contracts change, freeze, gate approval or merge. Fetch and requested normal push are the network exceptions. All fixture audio and generated reports remain outside Git.

Implementation is complete and independently reviewed with no remaining blocking findings. Final post-review Python suite: **130 passed in 70.602 s**, including both actual practice tracks. All requested detector/regression features are implemented; no latency acceptance or freeze was requested or performed. Main usage start: **83% five-hour / 76% weekly** around 08:40 PT November 9; final prepublication observation **65% / 73% at 09:02 PT**. Publication outcome/SHA is supplied in chat.

## Method and production integration

`long_correlation.py` moves the retained interior audit into the v3a production path. The earlier exact-only limitation is superseded for noisy native-rate long matching. `analyze-bounds.py` now selects `bounded-correlation` by default **only when v3a is explicitly selected**; the earlier exact matcher remains explicitly selectable. `load_long_anchors` still requires the complete identity-bound frozen source inventory and ordered long IDs. All source/scored identities and eligibility must reconcile; gaps and matcher outcomes grant no denominator or SETUP-AFFECTED exemption.

Criteria are copied unchanged from external `practice-d2-codex-interior-audit-20261109/bounded_interior_analysis.py` / `analysis-settings.json`:

- Expected position +/-1 s, 2 ms lag grid; only annotated long utterances.
- Three mean-centered RMS-envelope correlations: 10 ms log, 20 ms log, 10 ms linear.
- Each method: NCC >=0.80, margin >=0.10 over secondary local peaks at least 100 ms from winner, and winner not on search boundary. Every method must be unique.
- Near-top extent uses the contiguous region within 0.01 NCC of the maximum.
- Per-anchor uncertainty = maximum near-top half-extent over methods + cross-method displacement + 10 ms half-frame + 1 ms half-grid + one source sample + one recording sample.

No new numerical threshold was invented or tuned on these results. The step trigger remains absolute offset change greater than the combined per-anchor measurement uncertainty. The radius is method sensitivity, not a calibrated statistical confidence interval or a guarantee against unknown route bias. Small or cancelling interior changes are not ruled out.

The 3 s template begins 100 ms inside each long source span, with the interior audit's >=3.3 s passage guard. This selection is source-only, fixed before recording correlation. Forward-frame support is 3.018 s and is retained explicitly. Native source and recording rates may differ: each PCM array generates its own envelope on a shared time grid. No PCM resampling, affine template rate warp, source trimming, capture correction or fitted drift is used. The retained practice clock contributes **only its lead marker position minus the protocol's 1 s source lead**, centering searches by a constant offset. Affine slope/offset fields and stored step results are never detector inputs.

Matched support and full-unit coverage are distinct. Edge long anchors bind by exact ID to independently adjudicated full-unit continuous placements already required by the scorer. Their measured support plus/minus uncertainty must lie inside those finite ordered full-unit intervals. Those supplied unit boundaries establish coverage only; no unexamined source span is projected and no speech endpoint is moved. Step location remains between measured template supports. Missing, misbound, nonfinite or inconsistent edge timing is INCONCLUSIVE.

Step output includes signed magnitude and interval, location interval, bracketing IDs, combined anchor uncertainty, and symmetric uncertainty magnitude. Existing v3a widening applies plus and minus to every potentially affected/crossing unit through the next bracketing anchor. Nonunique, flat, weak, boundary, missing or unbounded anchors produce INCONCLUSIVE; none can exempt a unit or produce PASS. The bounds scorer retains step diagnostics when available even if marker/gap evidence blocks acceptance.

`detect-v3a-steps.py` is a standalone diagnostic CLI for an explicitly preserved sample-continuous mono PCM16 WAV, pinned source/recording/annotation hashes and a constant search offset. It writes a new JSON and exits2 on inconclusive timing. It never scores latency or changes/finalizes annotations. See README for command/schema.

## Actual preserved practice results

External evidence root: `C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/`.

`practice_step_fixture.json` pins relative paths and SHA-256 values for both source WAVs, original source annotations, previously preserved untrimmed continuous WAVs and lead-marker reports. Source/annotation/continuous hashes were also checked against the prior feasibility audit hash manifest before first replay. Before/after fixture checks pass; no original input changed. No raw evidence, audio or transcript content enters Git.

| Track | Long anchors | Unique | Detected continuous-view offset changes |
| --- | --- | --- | --- |
| Meeting | 45 | 45 | None above combined anchor uncertainty |
| Microphone | 39 | 39 | One positive change between `microphone-019` and `microphone-021` |

Microphone details:

- Before anchor measured start 135.357 s, offset 3.697 s, uncertainty 13.0625 ms.
- After anchor measured start 146.440 s, offset 3.775 s, uncertainty 13.0625 ms.
- Signed change **+78.000 ms**; combined uncertainty **26.125 ms**.
- Signed magnitude interval **+51.875 to+104.125 ms**, containing the previously reported roughly +80 ms shift with the correct sign.
- Location interval **138.3619375–146.4530625 s**, enclosing 141.7 s. This is a bracketing interval between template supports, not an exact step sample or proof of a capture cause. The before template lies within a longer utterance whose remaining audio can cross the disturbance; matching its first part does not certify the rest.
- Applied symmetric uncertainty **+/-104.125 ms** (= absolute 78 ms change + 26.125 ms combined uncertainty), not an offset correction.

External generated evidence: `practice-d2-v3a-noisy-step-20261109/initial-replay.json` contains all anchor/method diagnostics and steps. The final regression independently recomputes those results using production functions; no stored step result is used as expected-position input. `python-suite.txt` preserves the initial harness failure, `python-suite-corrected.txt` the 128-test correction, and `python-suite-reviewed.txt` the final post-review run.

This is a successful step-detector reproduction, **not a latency PASS or gate approval**. The microphone's original timestamp/sample-count inconsistency and original timestamped marker INCONCLUSIVE result remain in force. The practice annotations remain unchanged/unfrozen. No actual recording was frozen or scored for acceptance.

## Regression coverage and checks

New `test_long_correlation.py` covers:

1. Real-looking invented voiced/breath/noise signal, gain/noise changes and injected positive/negative 80 ms steps: correct signs and intervals, bracketing and symmetric end widening.
2. Valid complete two-long-unit coverage using independent full-unit timing; reject missing/misbound/nonfinite/outside-support edge intervals.
3. No-step noisy audio with different native source/recording rates.
4. Periodic ambiguous long matches make timing INCONCLUSIVE; no short-word matching.
5. Wrong-window, flat and unbounded support rejection.
6. Production source-inventory routing into noisy correlation with native-rate differences and hash binding.
7. Nonunique brackets suppress track acceptance, retain denominator and grant no setup credit.
8. Exact retained quality constants and boundary-peak rejection.
9. Absent external fixture yields an explicit skip reason naming `SCRB_V3A_PRACTICE_ROOT`.
10. Partial absence cannot hide a corrupted present fixture file; all present files are hashed before any skip.
11. Hash-bound actual practice: all 45 meeting anchors/no step and 39 microphone anchors/one correctly signed roughly 80 ms step bracketing 141.7 s; before/after identities unchanged. Fixture absence is a skip; a present hash mismatch fails.

The isolated CLI help test now includes `detect-v3a-steps.py`. All earlier v3/v3a regressions remain part of the complete suite.

`npm run check` passed type checking, ESLint, Vitest **819 passed / 63 skipped**, 52 files passed/6 skipped, 42.71 s Vitest duration. Existing Vite/CommonJS and localStorage warnings remain. Boundary script skips detached HEAD; changed-path inspection confirms offline backend analysis scripts/tests and process docs only. No package install or dependency-version change. `git diff --check` passed again after final review fixes. Final full Python suite: **130 passed**, 70.602 s; actual external fixture was present and passed, not skipped.

## Independent review and mistakes

Mandatory independent reviewer `/root/v3a_review` reviewed after the 128-test pass and npm check. It confirmed the retained matching criteria/native-rate method and found two integration issues: old full-span coverage against narrow templates, and absence skip preceding present-file hash validation. Both are corrected with focused passing regressions and the 130-test full pass. Reviewer follow-up: **independent code review passes, no remaining blocking findings**. It verified the independent full-unit coverage/support distinction and present-file hashing order. No broad suites were repeated by the reviewer; no reviewer files changed.

A-040 logs the isolated-Python absent-fixture subprocess mistake: direct module lookup omitted the sibling path and failed before its target test. Use discovery with explicit sibling directory and a single-test filter. The focused skip check passed and the corrected complete128-test suite passed in 68.524 s. The original failed log is preserved; no detector/practice test failed.

A-041 logs both review-detected coverage/fixture-ordering errors and corrections. No actual corrupted fixture was accepted, no evidence changed, and no latency/gate acceptance resulted. Final broad suites are repeated only after specific code/harness corrections; no physical tests or failed acoustic tests were repeated. Every command was planned below 20 minutes.

Reviewer first observation approximately 08:53–08:58 PT: 74% ->70% five-hour, 75% ->74% weekly. Same pool as parent, not isolated review cost; no reviewer mistakes or file changes. Follow-up review approximately 09:00–09:01 PT: 67% ->66% five-hour, 74% ->74% weekly. No reviewer mistakes or file changes. Main and reviewer rows are entered in `agents/agent_task_allocation.md`.

## Final usage and stable stop

Main end observation: **65% five-hour / 73% weekly remaining at 09:02 PT**, after all implementation/checks/review and before commit/push housekeeping. Start 83% / 76% around 08:40 PT. Same windows throughout: observed shared-account decreases 18/3 percentage points, **not isolated task costs**. Source `get_usage_limits.rateLimitsByLimitId.codex`. Five-hour reset Nov 9 **13:20:11 PT**; weekly reset Nov 15 **16:43:52 PT**. Codex/GPT-6 on Windows Desktop; exact variant/effort unavailable. Known overlap includes the mandatory independent reviewer; other account overlap unknown. Reviewer full observed span 74% ->66% / 75% ->74% overlaps the parent and must not be added as a separate cost.

No requested step-detector feature remains unimplemented. Limits remain explicit: method-sensitivity uncertainty is not a statistical confidence interval; the step is bracketed rather than located to an exact sample; no undetected sub-uncertainty/cancelling change is excluded; full-unit continuous placements must be independently adjudicated; invalid markers/gap maps or ambiguous anchors still prevent acceptance. Neither source rigidity outside the matched support nor a capture cause is inferred.

Commit and normal push are the remaining publication housekeeping; report SHA and stop. No additional recording, playback, rendering, capture change, freeze, gate approval or merge is authorized. Retain all original evidence and failed/corrected diagnostic logs. The previous exact-only handoff remains historical and is superseded for noisy long-step matching by this implementation.
