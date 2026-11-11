# D2 Timestamp-versus-Concatenation Audit

Own worktree `C:/Users/bchen/Documents/GitHub/scrb-codex`, branch `codex/gate3-practice-marker-audit`, starting from published `cd513ae1b57b4359557c729bd8bfa0c32358ecb5`.  Read-only diagnostic follow-up.  No source, production, threshold, protocol, exception, amendment, recording, playback, rendering, freeze, merge, rebase, or history rewrite change.

## Evidence Location and Method

All generated numeric outputs, decoded counterfactual WAVs, source-code snapshots, chunk-tag evidence, correlation traces, scripts, and hashes remain outside Git at:

`C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/practice-d2-codex-timeline-comparison-20261109/`

Read `final-report.md`, `timeline-comparison.json`, and `metadata-and-combined-uncertainty.json`.  The full report includes two-timeline marker/fit and anchor tables, duration/start-delta/jitter statistics, every microphone gap, code facts/line references, and limitations.  `input-hashes-before/after.json` verifies 249 inputs unchanged; original inputs were also rechecked against prior audit hashes and after the chunk-tag inspection.  No practice audio, raw log, hash manifest, or generated measurement report enters Git.

Every Opus chunk was decoded independently and appended in asserted sequence order, without timestamp placement, padding, overlap removal, or metadata-duration clipping.  FFmpeg handles per-file Opus pre-skip/final granule; no manual pre-skip subtraction.  Decoder warnings/errors were absent.  One microphone decoded-length discrepancy is retained in full and documented.  Concatenation is a counterfactual axis, not replacement gate evidence.

The same six previous 3 s source passages were reused with unchanged correlation methods and +/-1 s predicted search bounds.  All matches were unique.  Both marker-feature methods were retained on the new timeline so full combined uncertainties can be compared without selecting a favorable edge.  Initial detector-only fields remain in raw JSON; final report uses the full retained marker envelopes.

## Assessment and Code Meaning

The hypothesis is strongly supported for the meeting step and partially supported for microphone: timestamp placement accounts for most of the meeting residual pattern, whereas microphone still has residual timing structure on a concatenated axis.  Large isolated timestamp discontinuities exist near the common middle disturbance; normal rollover jitter is much smaller.  The data does not prove that timestamp jitter alone explains both routes or that physical audio was continuous/correct.

Capture code at immutable `553dd9080f452f8a54ccff5cd5fea8d6937438ae` uses WASAPI QPC first-frame stamps or QPC arrival fallback, a QPC session origin, timestamped chunks, and gap-aware playback.  Embedded chunk starts match manifests, with no changing capture-pipeline correction term throughout either track.  The offline script did not invent those offsets.  Device sample positions and timestamp-error flag history are not preserved at packet granularity in the chunk evidence examined, so the underlying cause cannot be certified from it.

Protocol v3 says to find markers in preserved original recordings (audio), with observer and playback harness on a monotonic clock; it does not explicitly define reconstruction of multiple Opus files plus gaps.  The app's implemented clock is timestamp/session based.  A sample-concatenated clock discards wall-time relationships and cannot silently replace it for observer latency.  Detailed verified facts versus assumptions are separated in the external report.  No new interpretation is implemented.

## Verification, Mistake, and Stop

Full Python suite passed **96 tests** in 11.379 s.  `npm run check` passed type checks, ESLint, and Vitest (**819 passed, 63 skipped; 52 files passed, 6 skipped; 39.12 s**).  Existing Vite/CommonJS and localStorage warnings remain.  The boundary command skipped this branch naming pattern; changed-path review confirms documentation-only changes.  Whitespace checks passed before commit.  Only documentation changes are expected in Git.  A-037 records an avoidable lookup of a later-added protocol file at candidate 553dd90; capture code was then inspected at the correct candidate and the current reviewed protocol separately.  No decoder, audio, or test failure resulted from that lookup.

Stop after reporting and publication.  Do not implement a timing exception, remove gaps from authoritative evidence, alter the capture code, or advance a freeze/merge from this diagnostic result.

## Last Observed Allowance and Publication

Start reading: 81% five-hour / 83% weekly remaining.  Last observed: 72% five-hour / 82% weekly at 01:45 PT after checks, before commit/push housekeeping and reply; not a guaranteed post-reply balance.  No quota-window reset during this task.  Proposed shared tracker row below is not inserted into agents/agent_task_allocation.md to avoid overlapping tracker edits.

| Date (PT) | Agent / device | Task and outcome | Start time | Last observation | 5h left, start -> observed | Week left, start -> observed | Observed decrease, 5h / week (pp) | Phase / model / effort | Retries | Acceptance | Source, reset, overlap and qualification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | Codex / Windows Desktop, own scrb-codex worktree | Two-timeline comparison; capture/playback code provenance checked; hypothesis partly supported, no exception implemented; 96 Python tests and npm check passed | Initial read before work; 01:34 PT repository observation | 01:45 PT before commit/push | 81% -> 72% | 83% -> 82% | 9 / 1 | Read-only analysis/docs / GPT-6 (exact variant unavailable) / effort unavailable | 1 corrected protocol revision lookup; no decoder/test retries | pending review | get_usage_limits rateLimitsByLimitId.codex; 5h reset Nov 9 05:50:24 PT; week reset Nov 15 16:43:52 PT. Other account overlap unknown; deltas are not isolated task costs. |

Commit title: `docs: compare timestamp and concatenated recording timelines`.  Normal push to the existing `codex/gate3-practice-marker-audit` branch is authorized.  The SHA/publication result is supplied in chat.  No subsequent implementation is authorized; report and stop.
