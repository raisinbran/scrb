# Read-Only D2 Practice Marker Audit

## Branch and Evidence

Own worktree `C:/Users/bchen/Documents/GitHub/scrb-codex`, branch `codex/gate3-occurrence-matcher`.  Task started at pushed `e920ba1fb547b4ea0536f77dfc225e8e82315de0`.  Rebased successfully, without conflicts, onto the latest locally available PR 74 head `60ea7d6b899b9d37d29bc047deb98a34acac7daa`; its local and cached origin refs matched.  No network fetch under the offline instruction.  The rebased pre-task matcher tip is `437bbcc`.

The requested rebase rewrote previously pushed matcher commits.  The existing remote matcher tip is not an ancestor of this rebased branch, so a same-name normal push is non-fast-forward.  No force-push or merge is permitted.  Owner explicitly authorized pushing to new branch `codex/gate3-practice-marker-audit` while leaving the existing remote matcher branch unchanged.  Publish HEAD to that new remote ref with a normal push; no force-push or merge.

All measurement outputs and practice data remain outside Git in:

`C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/practice-d2-codex-marker-audit-20261109/`

Read `final-report.md` and `final-report.json` there for per-track times, fit values and parameter bounds, anchor/pulse residuals, reference comparison, and limitations.  Also preserved there are before/after SHA-256 manifests, decoder/code provenance, original-input-to-derived-WAV identity mapping, per-chunk decode lengths, exact marker CLI JSON reports, and the read-only analysis script.  All 236 hashed inputs were unchanged.  Only the owner-designated synthetic practice recordings were read; no real meeting material was used.  No audio, log, hash manifest, decoded WAV, or generated measurement report is copied into Git.

## Findings and Scope

Both original marker patterns were detected using unchanged parameters.  The existing offset-change validation rejects both fits and reports latency INCONCLUSIVE.  Each two-point affine fit has zero anchor residual by construction; this does not waive the separate offset-change rule.  Do not claim the data satisfies the unchanged 100 ms implementation, nor manufacture harness trailing anchors using the detected drift.  Whether the intended agreement metric should instead be a post-fit residual needs owner clarification; no implementation, threshold, protocol, or source change made here.

Harness anchors use the logged QPC before/after waveOutRestart brackets and the nominal source marker positions, with half-bracket uncertainty.  Anchor mapping uses harness seconds; preserved recording time is reconstructed by chunk startNs.  Matching track and derived-recording SHA-256 bindings were verified.  Harness-basis publication conversion is refused because the fit is invalid; no publication or acceptance credit is invented.  The recorded ready-file filesystem timestamp and ready-file text differ slightly; comparison to the reported 0.29 s uses the logged filesystem timestamp explicitly.

The detector handled actual mono 48 kHz recordings after read-only Opus decoding to PCM16, without playback, synthesis, resampling, or parameter changes.  A short microphone decoded chunk exceeds its declared metadata span outside the marker windows; the derived timeline clips to declared endNs and preserves gaps instead of concatenating chunks.  The external report records the exact mismatch and its scope.  Existing synthetic PCM tests did not exercise original chunk storage/metadata; decoding is a separate analysis adapter, not a new product path.

The external report preserves a microphone trailing-onset discrepancy from Sonnet's detailed figure that exceeds this detector's frame-quantization uncertainty.  Different analysis windows/purity methods have different feature times; no calibrated acoustic-onset ground truth or cross-method uncertainty is available.  Do not hide that difference by increasing uncertainty or changing a parameter.  Other timing comparisons and route differences are reported with their uncertainty there.

## Regressions and Checks

New `test_practice_marker_clock.py` uses invented samples only.  It covers 48 kHz marker detection with 195-200 ms pulse durations; different route gains and 40/45 ms route offsets; a nonuniform trailing pattern with a 495 ms onset gap; and rejection of practice-scale common offset change despite exact affine anchor residuals.  These tests preserve existing behavior and do not redefine the 100 ms rule.  All three targeted tests passed; the complete rebased Python suite passed **91 tests** in 8.061 s.  No new detector parameter was needed, so the parameter-change stop condition was not triggered.

`npm run check` passed in the own worktree: type checks, ESLint, and Vitest (819 passed, 63 skipped; 52 test files passed, 6 skipped; 49.57 s).  Existing Vite/CommonJS and Node localStorage warnings remain.  Boundary command skipped this branch naming pattern; changed-path inspection confirms the scope listed below.  Whitespace checks passed before commit.  Python comment checker remains unavailable; owner/independent interpretation review remains pending.  Only tests and process/handoff documentation are changed by this task; production/analyzer implementation, source audio, rendering/measurement code, protocols, amendment, manifest, and thresholds are untouched.  No recording, playback, rendering, freeze, or merge.

## Mistakes and Usage

A-034 records an overly broad initial metadata inventory that included browser-profile filenames, produced truncated output, and required a narrower inventory.  It read filenames only, not profile content; subsequent reads were limited to authorized audio metadata/logs.  No private evidence was committed.  Requested invalid marker reports are measured outcomes, not agent-created application failures.  The rebase/publication constraint follows the owner's simultaneous rebase/no-force/no-merge instructions and is not attributed to a recording failure.

Last observed allowance was 93% five-hour / 85% weekly at 00:59 PT after tests and before commit/push housekeeping.  This is a snapshot, not a guaranteed post-reply balance.  No reset occurred within this task; the 5h window had refreshed before the start reading.  The following row is proposed for agents/agent_task_allocation.md, not inserted into the shared tracker to avoid concurrent edits.

| Date (PT) | Agent / device | Task and outcome | Start time | End time | 5h left, start -> last observed | Week left, start -> last observed | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | Codex / Windows Desktop; own scrb-codex worktree | Read-only D2 marker audit; both fits invalid under unchanged offset-change rule; 236 input hashes unchanged; 91 Python tests and npm check passed; normal push to owner-approved new audit branch | Initial read, exact PT time unavailable | 00:59 PT last observation, before commit/push | 100% -> 93% | 86% -> 85% | 7 / 1 | Analysis/tests / GPT-6 (exact variant unavailable) / effort unavailable | 0 audio/test retries; 1 corrected inventory | pending interpretation review | get_usage_limits rateLimitsByLimitId.codex; 5h reset Nov 9 05:50:24 PT; week reset Nov 15 16:43:52 PT. Other Codex overlap unknown; account deltas are not isolated task costs. |

Commit title: `test: audit practice marker drift without changing detection rules`.  The SHA and actual new-branch publication outcome are supplied in chat.  Continue with owner review of the external numerical report and clarification of the intended 100 ms agreement metric.  No parameter, protocol, source, recording, freeze, or merge change is authorized by this task.
