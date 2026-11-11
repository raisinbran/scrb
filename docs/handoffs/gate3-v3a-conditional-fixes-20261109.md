# v3a conditional-review corrections

## Scope, branch and state

Base `11d93b51b759a890e8750a555e18790babd49454`; requested `git pull --ff-only origin codex/gate3-practice-marker-audit` confirmed current before edits. Own detached worktree `C:/Users/bchen/Documents/ChatGPT/srcb/v3a-code-worktree-20261109`. Normal publication target is `HEAD:codex/gate3-practice-marker-audit`, never force-push. Final SHA/publication outcome is supplied in chat.

Only the three owner-requested corrections are implemented: persistent local source placement, raw practice count/span handling, and future clock metadata. No recording, playback, speech rendering, capture/UI/contracts change, freeze, observer-to-scorer integration, gate approval or merge. Existing v3 remains default and its path is unchanged. Source and evidence files remain preserved outside Git.

Implementation, checks and independent follow-up review are complete: **no remaining blocking findings**. Final full Python suite: **137 passed in 107.975 s** after the prefix correction. A focused native report-label check also passed in 33.909 s after naming the count field source_denominator and retaining the original annotation status. npm check passed. Owner/gate acceptance remains separate.

## 1. Persistent offsets and unresolved prefixes

Each unit supplies explicit source speech times (`source_start_s`, `source_last_word_start_s`, `source_last_word_end_s`). It is placed using its nearest preceding long anchor's measured source-to-recording offset and measured uncertainty. A long utterance may use its own measured anchor. Later units retain the measured offset after a step; they do not revert to a fixed first-anchor/source schedule.

For compatibility, earlier `continuous_*` inputs are interpreted as the previous fixed reference schedule: subtract `reference_schedule_offset_s` (default first long offset), then apply the local anchor. Output labels that basis and exposes `timing_anchor_id`, `timing_anchor_offset_s`, `timing_anchor_uncertainty_s` and locally placed `continuous_*` fields. Prefer explicit source fields. No short-word matching or affine/native-clock correction is introduced.

Significant step uncertainty is symmetric only for source endpoint positions strictly inside the unresolved interval between the before anchor's measured support end and the after anchor's measured support start. Speech end, last-word start and utterance onset have separate step uncertainty fields. A right-anchor utterance's first 100 ms remain uncertain until measured support starts; assigning the persistent offset does not certify that prefix. Later endpoints keep only the appropriate measured anchor uncertainty. Gap lookup covers the entire endpoint uncertainty range, including a boundary crossed by its upper bound.

`test_next_anchor_limits_widening` now asserts that extra step widening stops but the persistent +80 ms offset and 1 ms anchor uncertainty continue. The old test checked only zero extra widening and missed the stale nominal endpoint.

Counterexample regression: source end 205 s, publication 210.98 s (5.98 s on obsolete schedule). After a persistent −80 ms shift the true end is 204.92 s; conservative latency 6.061 s and best 6.059 s with 1 ms anchor uncertainty. Both are over 6 s, so it receives no timely credit. The +80 ms case gives conservative 5.901 s, correctly moving the other way. The selected anchor is the immediately preceding long; extra step widening is zero after that anchor.

Reviewer prefix regression: right source span 10–14 s, measured template 10.1–13.118 s, offset −80 ms, last-word start 10.01 s. The original first correction wrongly returned 9.929–9.931 s and accepted publication 9.98 s. The final code retains symmetric prefix uncertainty, includes the actual 10.01 s start in the interval and makes the real bounds entry point deny pre-speech credit. The positive counterpart passes too; the end endpoint already after support does not receive unnecessary bracket widening. A near-gap last-word-start regression ensures a nominal point just before a gap cannot hide a later uncertain start.

Full-unit coverage still binds edge template IDs and requires measured support plus/minus uncertainty inside the corresponding locally placed source unit. No unexamined source span is certified by correlation.

## 2. Actual native microphone reader and timing path

External root: `C:/Users/bchen/Documents/ChatGPT/srcb/gate3-v3-preflight-20261108/`. `practice_step_fixture.json` now pins the original microphone `chunks.json`, all 139 encoded chunks, the existing offline decoder and original harness-context JSON, in addition to previously pinned continuous/source WAVs and annotations. Present-file hashes are checked before missing-fixture skips and after replay. Only hashes/references are committed, never audio, transcripts or generated evidence.

The previous reader had not been exercised by the continuous-WAV regressions. Its exact timestamp-span/count equality and overlap prohibition would reject this preserved capture. There are 48 ordered microphone timestamp overlaps, and exactly one decoded-count mismatch: chunk 32 decodes 47688 samples against 47520 declared, +168 samples = 3.5 ms at 48 kHz. Meeting has no count mismatch but has its own small ordered overlaps.

`audited_decode_spans.json` permits exactly that known overrun, bound to track, sequence, 48 kHz rate, source SHA-256, index SHA-256 and both exact counts. It is not a broad 168-sample tolerance. Unknown discrepancies, a 167/169-sample difference, changed hashes, missing/reordered/duplicated timestamps or sample records still fail. No numerical gap cutoff is added.

The continuous view retains every decoded sample, including all 168 extra samples. The original scalar timestamped legacy view follows the prior audit: declared end clipping and last-chunk-wins overlap placement. This is labeled explicitly; no clipping enters continuous source placement. Gap output retains every chunk's actual count, declared span, overrun/cumulative overrun, overlap and unassigned gap. Gaps use union coverage; overlaps are not negative gaps and never reduce cumulative unassigned gaps or a unit denominator.

The real v3a marker CLI was exercised against all 139 original chunks, not only a preassembled WAV. Results:

- `gap_map.valid=true`, `audited_overrun_samples=168`.
- `clock.valid=true`, continuous marker disagreement approximately 80 ms with unchanged 100 ms/anchor-uncertainty rule.
- Original timestamped marker result remains **INCONCLUSIVE** under the original rule.
- Decoded continuous PCM identity exactly equals the previously preserved untrimmed continuous WAV.
- 39 long anchors are unique; the same approximately+78 ms step is found.
- 64 source units that have preceding long anchors prepare successfully with persistent offsets. `microphone-022`, for example, uses `microphone-021`'s measured offset (>3.75 s), with no residual extra step widening.

**Independent remaining condition:** `microphone-000` is an initial short utterance before the first long anchor. The requested preceding-long rule gives it none. Full 65-unit preparation therefore remains INCONCLUSIVE for that missing-anchor reason, **not** for 168 samples or timestamp/count inconsistency. It is explicitly retained in the 65-unit denominator; it is not granted setup credit, matched as a short word or placed from a future anchor. Preparation of the 64 supported units is diagnostic only and is never presented as reduced-denominator acceptance. Source annotations remain unchanged/unfrozen, no actual latency score is produced, and observer integration is deliberately absent. Resolving the initial-short policy needs a separate owner decision, not an unrequested exception.

Generated evidence remains in `practice-d2-v3a-conditional-fixes-20261109/`: original `microphone-timing-pipeline.json`, reviewed `microphone-timing-pipeline-reviewed.json` and final `microphone-timing-pipeline-final.json`, `python-suite.txt` and `python-suite-reviewed.txt`. Original diagnostic output is retained; reviewed output is a separate file. Full JSON contains clock/map identities, anchor evidence, prepared units, all 65 denominator accounting and the explicit unsupported initial unit. Raw inputs are unchanged.

## 3. Clock/schema fields only

Outer v3a clock report and gap map schema 2 carry `clock_context` schema 1: session ID, integer session origin in nanoseconds, origin status/method/evidence count, QPC basis and per-track identity. Both marker-check views carry that context and their own view identity.

For the actual microphone, session origin is **6784091222800 ns**, reconstructed as `SCRB_DEVICE_STAMP_NS - START_NS` and identical across all 139 chunks. It is explicitly **not a retained start ACK** and is distinct from an acoustic marker fit offset. Missing/inconsistent origin evidence yields null with an unavailable status.

QPC fields state native QueryPerformanceCounter-derived monotonic nanoseconds and 10^9 ns/s. Raw QPC frequency and observer frequency are null because chunks do not supply them. No frequency is invented. Observer basis/integration is explicitly unbound/not implemented; no observer event or publication timestamp conversion is added.

Track identity binds session, track, chunk-index hash and ordered source hashes. View identity additionally gives view kind, PCM16LE SHA-256, sample rate/count and track-identity hash. PCM hashes are not mislabeled as WAV-file hashes. This supplies explicit bindings for a later observer bridge without implementing it now.

## Checks, review and incidents

Targeted persistent-shift, prefix/near-gap, audited overrun, overlap, schema and actual native microphone tests pass. Final full Python suite: **137 passed in 107.975 s** after the prefix correction. Independent follow-up review passes with no remaining blocking findings. The first complete pre-review run passed 135 Python tests in 109.558 s. `npm run check` passed type checking, ESLint and Vitest **819 passed / 63 skipped**, 52 files passed/6 skipped, 38.95 s Vitest duration. Existing Vite/CommonJS/localStorage warnings remain. Boundary script skips detached HEAD; changed-path inspection confirms offline analysis/test/process files only. No dependency install or native/capture code change. `git diff --check` passed before final publication.

Mandatory independent reviewer `/root/v3a_review` reviewed after checks, confirmed the identity-specific overrun handling and clock-field disclosure, and found the right-anchor prefix error. It ran one focused reproduction, no broad suites and no physical operations. The final prefix/endpoint correction has targeted passing regressions and a 137-test full pass; follow-up review passed with no remaining blocking findings; it performed no broad reruns, file changes or physical operations. Initial review usage approximately 09:44–09:47 PT: 52% ->49% five-hour / 71% ->71% weekly, overlapping the parent, not an isolated review cost.

Incidents are entered in the existing register:

- **A-042:** earlier persistent-offset/stale-endpoint defect and missing raw-reader validation; both corrected. Old expected-bound assertions initially omitted the newly required 1 ms anchor uncertainty and were updated to the new specified arithmetic.
- **A-043:** initial native diagnostic assumed all 65 units had preceding long anchors; it correctly stopped at the initial short. A dependent manifest edit then encountered a missing key and changed nothing. The successful diagnostic now retains and reports that condition explicitly.
- **A-044:** right-anchor prefix uncertainty omitted in the first correction; review reproduced false pre-speech credit. Fixed with per-endpoint measured-support bounds and uncertainty-range gap lookup.

No original recording, annotation, log or source evidence was altered or deleted, and no actual gate/latency acceptance was credited.

## Final allowance and stable stop

Start remaining **63% five-hour / 73% weekly**; exact initial observation time unavailable, before the first captured 09:29 PT timestamp. Final prepublication observation **40% / 69% at 09:55 PT November 9**, after implementation/checks/review and before commit/push housekeeping. Same windows throughout: observed shared-account decreases 23/4 percentage points, not isolated task costs. Source `get_usage_limits.rateLimitsByLimitId.codex`; five-hour reset Nov 9 **13:20:11 PT**, weekly reset Nov 15 **16:43:52 PT**. Model GPT-6, exact variant/effort unavailable, Windows Codex Desktop. Known overlap includes mandatory reviewer; other usage unknown.

Reviewer initial approximately 09:44–09:47 PT: 52% ->49% five-hour / 71% ->71% weekly. Follow-up approximately 09:54 PT: 42% ->42% / 70% ->70%. Same shared pool; those overlapping deltas must not be added as a separate review cost. Reviewer reports no mistakes, file changes or broad-suite repeats. Main and reviewer rows are entered in `agents/agent_task_allocation.md` on this owner-authorized branch.

All three requested corrections are ready for normal publication. No count-caused INCONCLUSIVE remains in the native reader/clock/preparation of supported units. Full-track acceptance is still blocked by the initial short unit having no preceding long anchor; all 65 units remain accounted for, and no initial-short exception was added. Observer integration is intentionally absent. Preserve all raw evidence and diagnostic logs. No recording, playback, rendering, capture change, freeze, gate approval or merge is authorized. Final SHA and push outcome are supplied in chat; stop after publication.
