# D2 Clock, Integrity, and Short-Word Feasibility

Own worktree `C:/Users/bchen/Documents/GitHub/scrb-codex`, branch `codex/gate3-practice-marker-audit`.  Started from `a560046`, then owner-requested `git pull --ff-only origin codex/gate3-practice-marker-audit` fast-forwarded to `277b696`, adding the independent QA proposal note.  That pull and the final normal push are the explicitly requested network exceptions; all audio analysis was offline.  No history rewrite, capture/source/product-code change, threshold/protocol change, amendment implementation, recording, playback, rendering, freeze, or merge.

## External Evidence and Method

All numerical outputs, full per-unit tables, distributions, traces, scripts, controls, and hashes remain outside Git at:

`C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/practice-d2-codex-feasibility-20261109/`

Read `final-report.md`, `per-unit-tables.csv`, `distribution-summary.json`, `clock-identity.json`, `clock-utc-pairs.json`, `near-gap-alignment.json`, `crossing-utterance-check.json`, `gap-sample-accounting.json`, and `utterance-study-enriched.json`.  Original `utterance-study.json` remains preserved.  Before/after hashes and the final input recheck verify 256 input entries unchanged.  No practice audio, transcript, raw log, measurement artifact, or hash manifest enters Git.  Only source annotations and original source audio, not recognition output, were used to select/locate passages.

No correlation acceptance threshold was set.  Raw maximum, competing local maximum, valley-to-valley basin width, method displacement, sensitivity radius, and deliberately wrong-window results are reported.  All searches are +/-1 s around a declared expected position.  Local templates are not rate-warped; the old fit locates the bounded search only.  The three envelope settings are method-sensitivity checks, not a new scoring rule.  Width/radius estimates are not calibrated endpoint confidence intervals; a numerical maximum is not automatically an accepted reference match.

Spread sampling selected 10 single-word units per track, nearest long neighbors on both sides, and five spread long units.  An explicitly targeted additional microphone word and crossing long bracket were added to cover the known disturbance rather than silently replacing a spread sample.  Final tables include 11 microphone short/23 long and 10 meeting short/23 long, with per-unit negative controls.  Wrong windows are known different source utterance regions and exclude the target reference/repetition from their bounded support.

## Findings and Limits

Clock identity: the retained session log has open/stop but no literal start ACK clockOriginNs.  The origin is reconstructed from embedded first-frame stamps and starts, with code-verified initial zero correction and a constant difference across every chunk on both tracks.  Candidate 553dd90 uses QPC-derived native time; play-sources.ps1 and the observer probe use Stopwatch timestamp/frequency; DateTime.UtcNow is a separately paired wall-clock label.  Arithmetic clock identity is compatible with the evidence, while acquisition timestamp fidelity, actual hardware output time, and validated observer timing are not independently established.  The fitted acoustic offsets include route/feature timing and must not be substituted for the native session origin.  Code hashes and numerical comparisons are in the external report.

Near the disturbance: timestamp gaps have no original assigned chunk samples; offline WAV zeros are placeholders, not captured physical silence.  Meeting whole-template correspondence improves markedly on concatenation, supporting preservation of the tested ordered speech, but not certifying sample-perfect completeness or a physical playback stall.  The microphone crossing region remains non-rigid/ambiguous on both axes.  The study cannot rule out local omission, repetition, filler, or route/capture timing change there.

Short words: high positive peaks do not establish a validated classifier; meeting wrong-window peaks overlap positive-score values.  Numerical bracketing agrees closely off-step but is not independent timebase validation.  Known disturbance support flags include the targeted microphone short word and meeting short word immediately after the crossing long utterance.  The corrected tables retain these cases even if direct/bracket point estimates look close.  No fixed correlation criterion or proposed endpoint-uncertainty ceiling is approved.

Microphone structure: sampled concat per-utterance source offsets exhibit a localized before/after shift near the crossing region, rather than a smooth recording-wide rate change.  The small known decoder-duration discrepancy cannot explain the whole marker-span error.  Nearby short chunks/overlap localize the region but do not prove which samples were lost, repeated, filled, or delayed.  Detailed per-utterance offsets, local subpassages, and all competing peaks are retained externally.

The existing v3 marker-validity failure remains in force.  No reference-timing ambiguity is converted into transcript UNIDENTIFIED or best-case SETUP-AFFECTED credit, and no denominator or acceptance result is changed.  This is a feasibility report, not a clock-direct mode or amendment implementation.

## Verification, Incident, and Stop

Full Python suite passed **96 tests** in 10.345 s.  `npm run check` passed type checks, ESLint, and Vitest (**819 passed, 63 skipped; 52 files passed, 6 skipped; 38.55 s**).  Existing Vite/CommonJS and localStorage warnings remain.  The boundary command skipped this branch naming pattern; changed-path inspection confirms documentation-only changes.  Whitespace checks passed before commit.  Only handoff/incident documentation changes are expected in Git.  A-038 records a corrected analysis gap-flag bug: testing only a gap start after a candidate long start missed a gap overlapping the bracketing support.  The enriched report uses interval overlap over the full predicted bounded support.  Both original and corrected outputs are preserved; no acceptance claim or source mutation resulted.

Report and stop after publication.  The independent QA note remains conditional; this task does not approve or implement the proposed amendment or any timing exception.

## Last Observed Allowance and Publication

Start reading: 70% five-hour / 81% weekly remaining.  Last observed: 56% five-hour / 79% weekly at 02:30 PT after checks, before commit/push housekeeping and reply; not a guaranteed post-reply balance.  Same quota windows throughout.  The progress checkpoint occurred after clock/local evidence and the primary sample were ready; remaining work was the already-authorized report, checks, and publication.  Proposed tracker row below is not inserted into the shared tracker to avoid concurrent edits.

| Date (PT) | Agent / device | Task and outcome | Start time | Last observation | 5h left, start -> observed | Week left, start -> observed | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | Codex / Windows Desktop, own scrb-codex worktree | Clock identity reconstruction; local integrity and 67-unit feasibility/control tables; no cutoff/exception; 96 Python tests and npm check passed | 02:11 PT initial repository/allowance observations | 02:30 PT before commit/push | 70% -> 56% | 81% -> 79% | 14 / 2 | Analysis/docs / GPT-6 (exact variant unavailable) / effort unavailable | 1 corrected analysis gap-flag error; no failed decoder/test runs | pending review | get_usage_limits rateLimitsByLimitId.codex; 5h reset Nov 9 05:50:24 PT; week reset Nov 15 16:43:52 PT. Other account overlap unknown; displayed changes are not isolated task costs. |

Commit title: `docs: report clock and short-word timing feasibility`.  Normal push to the existing audit branch is owner-authorized; no force-push or history rewrite.  The SHA and actual publication outcome are supplied in chat.  Stop after reporting: no amendment, scoring change, or follow-on implementation is authorized by this diagnostic result.
