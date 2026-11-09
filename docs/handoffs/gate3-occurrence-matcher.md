# Gate 3 Offline Occurrence Matcher Handoff

## Scope and State

Owner-assigned offline implementation on Windows Codex Desktop, branch `codex/gate3-occurrence-matcher`, cut from local PR 74 branch `rosmont/windows-gate3-retest-preflight-20261108` at `1c0f6805699247db9d3624f95871a5262195846e`.  No network reads/fetches, rendering, recording, playback, source/threshold changes, freeze, gate decision, or merge.  The owner separately authorized committing and a normal branch push.  Existing rendering, measurement, amendment, manifest, and annotation files are unchanged.

## Implementation and Input Contract

- `scripts/gate3-retest/occurrence_matcher.py` reads existing annotation JSON (`utterances`, each with `id`, `reference_words`, `start`, `last_word_start`, both acoustic-end bounds, and eligibility).  It retains every occurrence and eligibility value, including exclusions, in reference order.
- Publication JSON declares `clock_basis` as `harness` or `recording`, plus `words`.  Harness input also requires `recording_sha256` matching the supplied clock report.  Each record has `id`, `track` (`meeting` or `microphone`), one visible word in `text`, first-visible `observed` time, and polling uncertainty `u` in seconds.  Input must be chronological.  A stable ID means a persistent word position, not a sentence string or transient viewport index.  Repeated polls of that position are deduplicated.  Conflicting text for the same ID fails explicitly; revision-history ingestion is not implemented.
- Optional `audio_start` and `audio_end` are independently established occurrence provenance in the annotation recording clock.  They must not be inferred from word equality, nearest publication time, recognition-model claims, or a latency cutoff.  They constrain overlapping candidate utterances, without capping publication latency.  A span overlapping several identical reference occurrences does not establish unique identity; both such repeats remain UNIDENTIFIED rather than receiving exact credit.
- Global minimum-edit word alignment includes insertions, deletions, and substitutions.  Every candidate endpoint comes from a complete chronological alignment that uses a publication at most once.  The matcher retains every equally optimal alignment instead of selecting a convenient path.  BOUNDED endpoint lists are marginal bounds from these valid alignments; shared candidates are alternatives, not permission to credit a publication twice.
- If an optimal alignment omits the endpoint, prefix identity is insufficient, or a later repeated sentence cannot be distinguished from delayed output without independent provenance, the occurrence is UNIDENTIFIED.  Exact multiword matches require confirmed prefix evidence too.  A substituted last word additionally requires at least three words, at least 60% ordered exact prefix words, and a unique span claim.  Multiple confirmed endpoints or a clock boundary case are BOUNDED.  A boundary case uses the interval lower bound `observed - u`, not its nominal estimate.  Pre-speech observations receive no exact credit.
- `marker_clock.py` detects the existing three 200 ms pulses at 500 ms spacing, at 880 Hz for microphone and 1320 Hz for meeting.  It searches only 0â€“10 s and 380â€“390 s, outside the scored interval.  Missing or multiple patterns produce explicit invalid/INCONCLUSIVE reports.  PCM16 WAV, an explicit channel, and a complete search window are required.
- Clock output includes track, SHA-256 of the complete analyzed recording file, selected channel, sample rate, offset, slope, drift ppm, interval bounds, detection uncertainty, and offset disagreement.  Invalid harness anchors return the same explicit invalid/INCONCLUSIVE report as missing markers.  Five-ms spectral-frame quantization and supplied harness-anchor uncertainty propagate into interval bounds; the 100 ms disagreement limit is unchanged.  Two anchors cannot establish nonlinear clock stability.  Real-route acoustic validation remains required.
- `--clock` requires a valid fit with matching track and recording SHA-256, and maps observer intervals from explicitly declared harness time into the unchanged annotation recording clock, preserving the fixed scored and recurrence windows.  No changes to the existing bounds analyzer are needed.  Its frozen-input requirement remains intact.  Explicit recording-clock inputs must omit `--clock`; omitted/unknown bases are rejected.  The low-level alignment API requires `clock_basis="recording"` explicitly, after validated conversion if needed.

Example commands for a future authorized offline analysis (not executed against owner audio here):

```powershell
python scripts/gate3-retest/marker_clock.py recorded.wav clock.json --track meeting --harness LEAD_HARNESS_TIME TRAIL_HARNESS_TIME --harness-u LEAD_UNCERTAINTY TRAIL_UNCERTAINTY
python scripts/gate3-retest/occurrence_matcher.py meeting-annotations.json visible-words.json alignment.json --track meeting --clock clock.json
```

Both commands refuse to overwrite output.  Marker CLI exits 2 on invalid synchronization.  The matcher emits `OFFLINE_ALIGNMENT_ONLY` rows compatible with `analyze_unit`/`summarize_track`, not frozen acceptance evidence.  Do not add a `frozen` flag without the owner's actual freeze approval.

## Verification

`python -m unittest discover -s scripts/gate3-retest -p test_*.py`: **70 passed**, including all existing tests and 22 new tests.

Matcher tests cover normal full pass; synthetic scale coverage at 75/65 occurrence counts with three repeating sentences; missing middle repetition with independent provenance; unresolved missing repetition without provenance; duplicate stable-ID polling; later duplicate unable to fill an earlier missing occurrence; substituted final word; rejected one-word substitution; delayed source-identified repetition; ambiguous pair with both endpoint bounds; pre-speech and wrong-track rejection; clock boundary classification; word insertion/deletion; rejection of endpoint-only identity; and CLI clock mapping plus overwrite refusal.

Marker tests cover both track frequencies with known synthetic offset/drift inside reported intervals; missing/wrong-frequency/incomplete patterns; ambiguous patterns; rejection of searches overlapping scored speech; excessive clock disagreement; inverse mapping with a 100 s offset and invalid-clock refusal; and PCM16 file-adapter integration with valid/wrong-track markers.  All audio is invented.  Temporary synthetic WAVs are test fixtures, not gate evidence.

`npm run check`: **passed** type checks, ESLint, and Vitest (**819 passed, 63 skipped; 52 test files passed, 6 skipped**).  Existing Vite/CommonJS and Node localStorage warnings appeared.  Boundary command skips branch names outside `ui/` and `backend/`; changed-path inspection confirms no UI, contract, or protected source/measurement files changed.  Electron smoke/physical/native integration tests were not separately launched under the offline/no-rendering restriction.  Broad npm checks were not repeated after Python-only changes.

`git diff --check`: passed before staging; staged diff also checked before commit.  `pde-comment-checker` is unavailable on PATH and was not found in the inspected repo/plugin locations; required automated Python comment checking remains pending.  Author reviewed docstrings/comments; independent code review remains pending.  No subagent/reviewer was assigned, and no merge is authorized.

## Mistakes and Remaining Work

Confirmed incidents A-027 and A-028 are committed to `agents/agent_self_induced_failures.md`.  A-027 was an uncommitted clock-conversion direction mistake caught before testing; A-028 was a CLI sibling-import failure caught by the new subprocess test.  The corrected Python suite passes.  One failed Python-suite invocation; one focused correction/retry.  Passing targeted suites were rerun only after added code or regression tests.

The current UI observer remains an unvalidated reach probe.  This work does not invent viewport visibility, stable word IDs, transcript revision history, or independent audio provenance from its raw element dump.  A validated observer-to-word adapter and actual physical-route marker calibration are still required before real scoring.  Truly indistinguishable repetitions stay uncredited.  Independent review should inspect alignment ambiguity, input provenance, and marker uncertainty, then run the unavailable comment checker.  Continue only with owner-authorized evidence/observer work; do not render, record, freeze, merge, or alter Sonnet's files under this assignment.

## Usage Row Proposed for agents/agent_task_allocation.md

Not added to the shared tracker to avoid overlapping tracker edits.  Commit identity for this handoff is the branch's commit titled `feat: add offline occurrence alignment and marker clock analysis`; resolve with `git log -1`.  Final implementation allowance observation was at 22:23 PT before commit/push housekeeping.  Publication outcome and SHA are reported in the chat; no PR or merge is requested.

| Date (PT) | Agent / device | Task and outcome | Start time | End time | 5h left, start -> end | Week left, start -> end | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-08 | Codex / Windows Desktop | Gate 3 offline occurrence matcher and synthetic marker clock; 70 Python tests plus npm check passed; independent review pending | Initial allowance read; exact PT time unavailable | 22:23 PT (before commit/push housekeeping) | 79% -> 72% | 89% -> 88% | 7 / 1 | Implementation / GPT-6 (exact variant unavailable) / effort unavailable | 1 failed synthetic-suite invocation corrected | pending | get_usage_limits, rateLimitsByLimitId.codex. 5h reset Nov 9 00:47:56 PT; weekly reset Nov 15 16:43:52 PT. Shared account; Codex overlap unknown; Sonnet is concurrently assigned separate PR 74 work in its own quota pool. Account changes are not isolated task costs. |

## Conditional Review Follow-Up (9a4d5a1)

Work is exclusively in `C:/Users/bchen/Documents/GitHub/scrb-codex`, its own git worktree of `codex/gate3-occurrence-matcher`, starting from `9a4d5a135b5e68fc07c51b4d3c005ebe7315a331`.  The clean shared checkout was detached at the same commit solely to free this branch for `git worktree add ../scrb-codex codex/gate3-occurrence-matcher`; no files were edited there.  Sonnet's PR 74 worktree is separate.  The previous verification and usage sections above describe the initial implementation; this section records the review follow-up.  No production change was made before collecting the red evidence below.

| Finding and regression | Before fix on 9a4d5a1 | After fix |
| --- | --- | --- |
| P1-1 `test_broad_provenance_cannot_confirm_repeats` | FAIL: missed 20–23 s occurrence plus duplicated 30–33 s sentence, all spans 20–33 s, incorrectly gave MATCHED to both units at 34/35 s | PASS: neither row gets exact credit; exact-credit publication IDs cannot be reused |
| P1-2 extended `test_clock_boundary` | FAIL in nominal=22.005 subcase: MATCHED instead of BOUNDED, despite observed=22.010, u=0.050, lower=21.960, start=22.000 | PASS: lower-bound straddle gives BOUNDED; original nominally pre-speech subcase still passes |
| P1-3 `test_clock_track_mismatch_rejected` | FAIL: CLI returned 0 with microphone fit for meeting | PASS: explicit track mismatch rejection |
| P1-3 `test_clock_recording_mismatch_rejected` | FAIL: CLI returned 0 for unrelated recording digest | PASS: explicit recording mismatch rejection |
| P1-3 `test_omitted_clock_basis_rejected` | FAIL: CLI returned 0 without a basis | PASS: omitted basis rejected |
| P1-3 `test_harness_basis_requires_fit` | FAIL: CLI returned 0 for harness basis without a fit | PASS: validated fit required |
| P1-3 `test_report_contains_recording_identity` | FAIL: report track was absent | PASS: report track, recording digest, rate, and channel verified |
| P2 `test_invalid_harness_is_inconclusive` | ERROR for reversed anchors, NaN anchor, and negative uncertainty due to uncaught ValueError | PASS: each returns invalid/INCONCLUSIVE with an anchor error |
| P2 `test_pcm16_rates_and_stereo` | PASS before fixes, added coverage rather than an existing defect | PASS: 16/24 kHz PCM16 stereo detects channel 1; silent channel 0 is invalid |
| P2 synthetic scale label | Previously called `test_actual_track_counts`, overstating real-track fidelity | Renamed `test_synthetic_scale_counts`; invented scale coverage only |

Pre-fix commands actually executed after adding the tests and before production edits:

```powershell
python -m unittest discover -s scripts/gate3-retest -p test_review_fixes.py -v
# 10 tests: 6 assertion failures, 3 erroring anchor subcases; remaining cases passed.
python -m unittest discover -s scripts/gate3-retest -p test_occurrence_matcher.py -k test_clock_boundary -v
# 1 test: 1 failing subcase (nominal 22.005).
```

The identical commands passed after fixes (10 tests and 1 test).  Then the full Python suite passed **80 tests**.  The intentional red runs are defect reproductions requested by the owner, not accidental retries.  Existing positive clock conversion/overwrite tests were updated to declare their basis and synthetic fit identity.  No speech, clock-disagreement, or marker-detection threshold was changed.

### Marker Detection Parameters for Future Freeze Hashing

These are the existing detector values, now explicitly recorded; no freeze is performed.  Include the detector script and this handoff in any later owner-approved hashing process.

| Parameter | Value / interpretation |
| --- | --- |
| PCM / channel | Uncompressed signed little-endian PCM16; explicit zero-based channel; never average stereo channels |
| Tone frequencies | Microphone 880 Hz; meeting 1320 Hz; below Nyquist |
| Analysis frame | Nonoverlapping `round(sample_rate * 0.005)` samples, minimum 1; 80 samples at 16 kHz, 120 at 24 kHz |
| Amplitude floor | Frame mean-square >= `(0.02 * 32768)^2`; RMS >= 655.36 PCM units (2% full-scale) |
| Spectral purity | >= 0.8, defined as `2*(real^2 + imag^2)/(frame_samples * sum(sample^2))` at the track tone frequency; zero energy gives zero purity |
| Pulse count / duration | Exactly one candidate of three consecutive tone runs; each duration 0.200 s +/- 0.020 s |
| Pulse onset spacing | Each adjacent onset difference 0.500 s +/- 0.020 s |
| Search intervals | Lead [0, 10] s; trail [380, 390] s; wholly outside scored [20, 380] s; full window must exist |
| Pattern window margin | First onset minus one frame and last pulse end plus one frame must stay inside search window |
| Detection uncertainty | First detected tone onset +/- one frame duration; propagated with supplied harness-anchor uncertainty |
| Clock agreement | Absolute offset change plus both detection and harness uncertainty radii <= 0.100 s |

Report identity binds the fit to the full preserved recording SHA-256, track, sample rate, and chosen channel.  Publication JSON supplies the expected `recording_sha256` for harness conversion.  This hash comparison binds metadata; it does not manufacture trustworthy observer provenance.  Existing scored/recurrence windows remain in recording time.

### Follow-Up Verification and Usage

Final Python suite: **80 passed** in 4.090 s, including the strengthened identity-confirmed/identity-unique flag assertions.  Final `npm run check` in `scrb-codex`: **passed** type checks, ESLint, and Vitest (**819 passed, 63 skipped; 52 test files passed, 6 skipped**).  Vitest ran in this worktree and took 39.62 s.  Existing Vite/CommonJS and localStorage warnings remain.  The boundary command skipped the branch naming pattern; changed-path inspection confirms only analyzer modules, synthetic tests, this handoff, and the incident register changed.  No renderer, measurement code, protocol, amendment, manifest, source audio, contracts, or UI files changed.

Offline dependency setup: cache-only `npm ci --offline --ignore-scripts --no-audit --no-fund` failed ENOTCACHED for Electron.  Local dependencies were then copied into this worktree with junctions excluded; all eight @scrb workspace junctions were recreated pointing inside `scrb-codex`.  The initial root-only copy omitted workspace-local dependencies and the first npm check stopped at TS2307 for @vitejs/plugin-react.  The identified apps/desktop and packages/transcription node_modules directories were copied locally; the corrected full check passed.  No install lifecycle scripts, downloads, or shared-tree writes were used.  Ignored local node_modules/build outputs are test setup, not source changes or gate evidence.

A-029 records the review-discovered initial implementation defects.  A-030 records the failed offline setup and missing workspace-dependency copy.  A-031 records a silent incident-register insertion/Unicode handoff edit error, caught and repaired before commit.  Intentional pre-fix red runs are requested reproductions, not mistakes or automatic retries.  There were no accidental failed Python tests during the fixes.

`git diff --check` passed; staged diff checked before commit.  `pde-comment-checker` remains unavailable.  Follow-up independent review of the fixes remains pending; the owner's supplied conditional review was the independent review of 9a4d5a1.  No merge or gate approval is implied.  Continue by reviewing this follow-up commit and running the missing comment checker in an environment that has it.  Observer ingestion and physical-route calibration remain separate owner-authorized tasks.

Follow-up commit title: `fix: address occurrence matcher conditional review`.  The pushed SHA and publication outcome are supplied in the final chat response.  The proposed usage row below is not inserted into the shared tracker, avoiding concurrent tracker edits.

| Date (PT) | Agent / device | Task and outcome | Start time | End time | 5h left, start -> end | Week left, start -> end | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-08 | Codex / Windows Desktop; own scrb-codex worktree | Conditional-review fixes to 9a4d5a1; demonstrated before/after regressions; 80 Python tests and npm check passed | Initial pre-worktree read; exact PT time unavailable | Post-code-push observation (exact PT time unavailable) | 70% -> 63% | 88% -> 87% | 7 / 1 | Implementation / GPT-6 (exact variant unavailable) / effort unavailable | 2 setup failures; corrected npm check rerun once; no accidental Python failure | pending | get_usage_limits, rateLimitsByLimitId.codex. Same windows: 5h reset Nov 9 00:47:56 PT; week reset Nov 15 16:43:52 PT. Other Codex overlap unknown; Sonnet concurrently works in a separate worktree/quota pool. Account-level movement is not isolated task cost. |

Implementation commit `fce384df2ca8596f0e2208721e83356a4570eae0` was pushed normally; local and upstream refs matched and the worktree was clean.  A final account read after that push showed 63% five-hour / 87% weekly remaining; the proposed follow-up usage row above records that reading.  This final handoff update is documentation-only.
