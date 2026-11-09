# Gate 3 Offline Occurrence Matcher Handoff

## Scope and State

Owner-assigned offline implementation on Windows Codex Desktop, branch `codex/gate3-occurrence-matcher`, cut from local PR 74 branch `rosmont/windows-gate3-retest-preflight-20261108` at `1c0f6805699247db9d3624f95871a5262195846e`.  No network reads/fetches, rendering, recording, playback, source/threshold changes, freeze, gate decision, or merge.  The owner separately authorized committing and a normal branch push.  Existing rendering, measurement, amendment, manifest, and annotation files are unchanged.

## Implementation and Input Contract

- `scripts/gate3-retest/occurrence_matcher.py` reads existing annotation JSON (`utterances`, each with `id`, `reference_words`, `start`, `last_word_start`, both acoustic-end bounds, and eligibility).  It retains every occurrence and eligibility value, including exclusions, in reference order.
- Publication JSON is `{"words": [...]}`.  Each record has `id`, `track` (`meeting` or `microphone`), one visible word in `text`, first-visible `observed` time, and polling uncertainty `u` in seconds.  Input must be chronological.  A stable ID means a persistent word position, not a sentence string or transient viewport index.  Repeated polls of that position are deduplicated.  Conflicting text for the same ID fails explicitly; revision-history ingestion is not implemented.
- Optional `audio_start` and `audio_end` are independently established occurrence provenance in the annotation recording clock.  They must not be inferred from word equality, nearest publication time, recognition-model claims, or a latency cutoff.  They constrain overlapping candidate utterances, without capping publication latency.
- Global minimum-edit word alignment includes insertions, deletions, and substitutions.  Every candidate endpoint comes from a complete chronological alignment that uses a publication at most once.  The matcher retains every equally optimal alignment instead of selecting a convenient path.  BOUNDED endpoint lists are marginal bounds from these valid alignments; shared candidates are alternatives, not permission to credit a publication twice.
- If an optimal alignment omits the endpoint, prefix identity is insufficient, or a later repeated sentence cannot be distinguished from delayed output without independent provenance, the occurrence is UNIDENTIFIED.  Exact multiword matches require confirmed prefix evidence too.  A substituted last word additionally requires at least three words, at least 60% ordered exact prefix words, and a unique span claim.  Multiple confirmed endpoints or a clock boundary case are BOUNDED.  Pre-speech observations receive no exact credit.
- `marker_clock.py` detects the existing three 200 ms pulses at 500 ms spacing, at 880 Hz for microphone and 1320 Hz for meeting.  It searches only 0–10 s and 380–390 s, outside the scored interval.  Missing or multiple patterns produce explicit invalid/INCONCLUSIVE reports.  PCM16 WAV, an explicit channel, and a complete search window are required.
- Clock output includes offset, slope, drift ppm, interval bounds, detection uncertainty, and offset disagreement.  Five-ms spectral-frame quantization and supplied harness-anchor uncertainty propagate into interval bounds; the 100 ms disagreement limit is unchanged.  Two anchors cannot establish nonlinear clock stability.  Real-route acoustic validation remains required.
- `--clock` maps observer intervals from harness time into the unchanged annotation recording clock, preserving the fixed scored and recurrence windows.  No changes to the existing bounds analyzer are needed.  Its frozen-input requirement remains intact.

Example commands for a future authorized offline analysis (not executed against owner audio here):

```powershell
python scripts/gate3-retest/marker_clock.py recorded.wav clock.json --track meeting --harness LEAD_HARNESS_TIME TRAIL_HARNESS_TIME --harness-u LEAD_UNCERTAINTY TRAIL_UNCERTAINTY
python scripts/gate3-retest/occurrence_matcher.py meeting-annotations.json visible-words.json alignment.json --track meeting --clock clock.json
```

Both commands refuse to overwrite output.  Marker CLI exits 2 on invalid synchronization.  The matcher emits `OFFLINE_ALIGNMENT_ONLY` rows compatible with `analyze_unit`/`summarize_track`, not frozen acceptance evidence.  Do not add a `frozen` flag without the owner's actual freeze approval.

## Verification

`python -m unittest discover -s scripts/gate3-retest -p test_*.py`: **70 passed**, including all existing tests and 22 new tests.

Matcher tests cover normal full pass; 75/65 occurrence counts with three repeating sentences; missing middle repetition with independent provenance; unresolved missing repetition without provenance; duplicate stable-ID polling; later duplicate unable to fill an earlier missing occurrence; substituted final word; rejected one-word substitution; delayed source-identified repetition; ambiguous pair with both endpoint bounds; pre-speech and wrong-track rejection; clock boundary classification; word insertion/deletion; rejection of endpoint-only identity; and CLI clock mapping plus overwrite refusal.

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
