# Gate 3 Windows: proposed audited sample-count row for scored-run-2 microphone chunk 47 (PROPOSAL ONLY)

Status: **PROPOSED, not approved, not implemented.** Drafted 2026-11-10 by Claude Code (Sonnet 5.5) and rewritten the same day under owner decision option (c): replace the earlier general rule (X = Y = 960 samples) with one narrow, hash-bound row following the chunk-32 precedent. It needs independent review and explicit owner approval before any change. Nothing pinned, scripted, tested, scored or classified was changed or run.

## 1. Blindness statement

The row is derived from capture facts only: chunk metadata (`chunks.json`) and decoded sample counts. It was drafted **without reading any scored-run-2 per-unit latency, recurrence or classification result**, and without running scoring, the matcher, v3a timing, analyze-bounds or classify.

Read for the first draft: `v3a_timing.py` (lines 60-315), `audited_decode_spans.json`, `README.md` (lines 232-247), grep lines of `test_v3a_conditional.py` and `marker_clock.py`, six tracks' `chunks.json` and `.opus` chunks (decoded), three grep lines of the scored-run runbook, and the tails of `agents/agent_self_induced_failures.md` and `agents/agent_task_allocation.md`. Read for this rewrite: this proposal, `v3a_timing.py` lines 108-115, 249-261 and 465-492, `analyze-bounds.py` lines 27-30 (found by grep), `test_v3a_conditional.py` lines 64-90.

**Disclosed incidental exposure:** the tail of `agents/agent_task_allocation.md` displayed the existing scored-run-2 usage row, which states that the meeting track was provisionally PASS (recurrence NOT OBSERVED) and the microphone track INCONCLUSIVE at chunk 47. A grep also returned the heading of register entry A-057. No microphone per-unit latency or recurrence value was seen, and the scored-run-2 result handoff and all scoring outputs were not opened. Logged as A-058.

## 2. Observed facts (capture facts only)

Method: declared = `round(endNs*rate/1e9) - round(startNs*rate/1e9)` from `chunks.json` (the formula in `gap_map`); decoded = frames from the retained ffmpeg decode of each `.opus` file (the pinned pipe-WAV method of `load_views`). Decoder: `gate3-integrated-evidence\decoder\ffmpeg.exe`, SHA-256 `e41cab268e561618eacd9b9190134464f87eded52327bdb0d2a4576b220ec030`, version 9.0. The method reproduces the existing audited value exactly (practice chunk 32: 47520 declared, 47688 decoded). An earlier granule-position count did not reproduce it and was discarded.

Evidence root: `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\`.

| Recording / track | chunks.json SHA-256 | Chunks | Mismatching | Seq | Declared | Decoded | Diff (samples) | Diff (ms @ 48 kHz) | Offset from first chunk (s) | Chunk length (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| scored-run-2 microphone | `fa595b9d5e75ccf04b6424c4e7fc423d1cca15c06652ec58a75ca16d525a2bd1` | 157 | 1 | 47 | 239040 | 239688 | +648 | +13.5 | 106.149 | 4.98 |
| scored-run-2 meeting | `d5b12853756ca73b75c300317d50204f65eb5ba9885b72f6d89221df8085842a` | 84 | 0 | | | | | | | |
| practice-d2 microphone | `c99682505f904e801d9f288d963f4407ca1a2eb39d092eebb8efc3b6afd87290` | 139 | 1 | 32 | 47520 | 47688 | +168 | +3.5 | 106.062 | 0.99 |
| practice-d2 meeting | `20a5ad7d4ac741f0fdfb5ace8b1bd007b11e1d0d51a421bd87cb79fdc812d176` | 91 | 0 | | | | | | | |
| rehearsal-1 microphone | `4dfa6080f7727b04665d358847ece54f2b29b5ff7d62e0ffc6461fea7a4f1a69` | 26 | 0 | | | | | | | |
| rehearsal-1 meeting | `24486d73825cb2b508ac397acf5a184d4938cccb6f851b62e416d69eb64345d7` | 12 | 0 | | | | | | | |

Source SHA-256 of the two mismatching chunks: scored-run-2 mic chunk 47 `418e75c4c1f60fa28d7e197955eae1042d9ecf6d4251fa7eafc8b3be3a80f41a` (absolute `startNs` 106,158,295,700, `endNs` 111,138,295,700); practice mic chunk 32 `86198be2632f2435a0044ee702401601a9d1e5af520916186b738a6d8d9f4571`.

Existence: scored-run-2, practice-d2 and rehearsal-1 exist and were read; the practice recording is the one the chunk-32 allowance was derived from (its metadata SHA equals the allowance's). `scored-run-1-app` has no `chunks.json` and was not examined; nothing else was searched or guessed.

Other capture facts: both mismatches are microphone chunks near 106 s, both decoded > declared, both close on `discontinuity` (chunk 32 opens on `rollover`, chunk 47 on `discontinuity`). Chunk 47 (4.98 s) sits between 10 ms `discontinuity` chunks 46 and 48; chunk 46 ends 2.57 ms after chunk 47 starts (timestamp overlap) and chunk 48 starts 2.50 ms after chunk 47 ends (gap). Neither excess is a whole number of 20 ms Opus frames. No negative mismatch exists in any inspected track. Whether any scored unit's anchor lies inside chunk 47 was not determined (that needs matcher output).

## 3. The existing rule and chunk-32 allowance

- Rule, `scripts/gate3-retest/v3a_timing.py:147-149` (`gap_map`): `overrun = audited_overrun(record, track, rate, metadata_sha256, end-start)` then `require(count > 0 and end > start and count-(end-start) == overrun, 'Inconsistent timestamp/sample-count record outside audited span allowance')`. Any other difference, either sign, invalidates the track gap map (INCONCLUSIVE).
- Allowance: `scripts/gate3-retest/audited_decode_spans.json`, one row (microphone, metadata SHA `c99682...7290`, source SHA `861986...4571`, seq 32, rate 48000, declared 47520, decoded 47688, overrun 168). `audited_overrun` (lines 108-115) returns the overrun only on an exact match of track, rate, both SHAs, seq and both counts, else 0. README lines 238-247 say there is no generic numerical cutoff.
- Application of the excess: nothing is excluded and no offset is corrected. The continuous view keeps every decoded sample; the legacy timestamped view clips the chunk to its declared end; `decoded_overrun_samples` and `cumulative_overrun_samples` are recorded; `timestamp_displacement_samples = start - continuous` therefore falls by the overrun for every later chunk. `placement_interval` (249-261) returns `[seconds + min(0, shift)/rate, seconds + max(cumulative_gap, shift)/rate]`: an overrun can only lower the **lower** bound. `marker_clock.py` only reports `latency: INCONCLUSIVE` when the gap map is invalid (lines 202-207); it has no allowance logic.

## 4. Proposed row (the whole rule)

Add exactly one row to `audited_decode_spans.json`, accepted only when **all** of these match exactly:

| Field | Value |
|---|---|
| track | `microphone` |
| rate | 48000 |
| metadata SHA-256 | `fa595b9d5e75ccf04b6424c4e7fc423d1cca15c06652ec58a75ca16d525a2bd1` (scored-run-2 microphone `chunks.json`) |
| source SHA-256 | `418e75c4c1f60fa28d7e197955eae1042d9ecf6d4251fa7eafc8b3be3a80f41a` |
| seq | 47 |
| declared samples | 239,040 |
| decoded samples | 239,688 (overrun 648 samples = 13.5 ms) |

Everything else stays INCONCLUSIVE: any other count in that chunk (including 647 or 649 excess), any other chunk, any other recording, metadata hash or source hash, any decoded < declared (negative) mismatch, and any second excess in the same track beyond the existing audit rows. There is **no X, no Y and no numerical tolerance**. The new row must match its identity **and** counts exactly and cannot fall back to any wider rule: `audited_overrun` keeps its exact-match-or-zero behaviour, and the implementation must not add a ceiling, a tolerance or a "close enough" path. The chunk-32 row is untouched and still applies only to the practice recording.

Why this narrow: the facts are two events in two recordings; a general rule would be a tolerance chosen after seeing the data for cases not yet observed, and could hide a genuine capture fault. A single hash-bound row accepts one reviewed observation and nothing else, identical in kind to chunk 32. The meeting track has no mismatch, so the row does not touch it; had a meeting-track mismatch occurred it would need its own reviewed row.

## 5. How the allowance is applied, and the arithmetic

Confirmed pairing in code (`scripts/gate3-retest/analyze-bounds.py:29-30`, fed by `v3a_timing.py:479-486`):

- `conservative = max(point["observed"]) - unit["earliest_acoustic_end_s"]`
- `best = min(point["observed"] - point["u"]) - unit["latest_acoustic_end_s"]`
- `earliest_acoustic_end_s` is the **lower** bound of `placement_interval` and `latest_acoustic_end_s` the **upper** bound. Latency is publication time minus acoustic-end time, so the lower acoustic bound drives the conservative (largest) latency and the upper bound drives best-case.

For valid gap-map rows `shift = cumulative_gap - overlaps - overruns <= cumulative_gap`, so the upper bound `max(cumulative_gap, shift)` is `cumulative_gap` and **does not change** when the overrun is accepted. The overrun lowers `shift` by M = 648 samples (M/rate = 13.5 ms), so `min(0, shift)` falls by **at most 13.5 ms** and the lower bound falls by at most that. Therefore for every unit after the chunk, and (with the required code change below) every unit inside it:

- acoustic upper bound: unchanged; **best-case latency: unchanged**;
- acoustic lower bound: decreases by at most 13.5 ms (cumulative accepted excess / rate);
- **conservative latency: can increase by up to 13.5 ms and cannot decrease.** A unit at 5.993 s conservative could become 6.0065 s and must **not** keep a 6 s PASS; the same arithmetic applies to the 3 s threshold.
- units before chunk 47: unchanged.
- units **inside** chunk 47 must include that chunk's own 648 excess in the lower-bound calculation (current code uses the displacement before the chunk, so this is a required implementation change, not existing behaviour).

The allowance can therefore only make results less favourable, never more. This is arithmetic, not a result: it does not say which units are near a threshold, and it does not promise the outcome will be unchanged.

(A previous draft of this proposal paired the bounds the other way and claimed the conservative latency was unchanged. That was wrong; logged as A-059.)

## 6. Required tests (not written here)

In `scripts/gate3-retest/test_v3a_conditional.py` (pattern of `TestAuditedGapReader`, lines 67-89) or a new module, with synthetic records using the real identity and counts:

1. The exact row (microphone, 48000, metadata SHA above, source SHA above, seq 47, declared 239,040, decoded 239,688) gives a valid gap map with `decoded_overrun_samples == 648` and `audited_overrun_samples == 648`.
2. Stays INCONCLUSIVE: excess 647 and 649; a different source SHA; a different metadata SHA; seq 46 or 48; rate not 48000; track `meeting`; decoded < declared (for example -1); a second excess chunk; the row applied to another recording's identity.
3. Chunk-32 behaves as before (the existing 168 / 167 / 169 / changed-hash assertions pass unchanged).
4. Placement: the acoustic-placement **lower bound cannot increase** and the **upper bound is unchanged** relative to the same records with the excess treated as zero.
5. Best-case latency is unchanged; conservative latency cannot decrease and increases by at most 648/48000 s.
6. Units before chunk 47 are unchanged; units inside chunk 47 and units after it are checked (inside includes the 648 in the lower bound).
7. A threshold test: a unit at 5.993 s conservative without the row is above 6 s with it (no 6 s PASS), and likewise for 3 s.
8. After approval only: the scored-run-2 microphone gap map is valid and records exactly 648; no other chunk in any inspected recording changes status.

## 7. Precedent and honesty

- This is a **rule change proposed after seeing the data**, after a pinned rule marked the microphone track INCONCLUSIVE. Treat it with the suspicion that pattern deserves.
- The number (648) was derived from capture metadata and decoded counts without reading microphone per-unit latency. The incidental exposure to the provisional track-outcome row is disclosed in section 1.
- The allowance can only **increase** conservative latency by up to 13.5 ms and never makes a result more favourable; it does **not** guarantee an unchanged outcome (a unit near a threshold could move across it).
- It would **not** fix: any other or negative mismatch; any other gap-map invalidity; ambiguous or missing anchors; any other recording or track; the open question why the capture produces extra decoded samples near 106 s in both microphone recordings; and it does not turn the INCONCLUSIVE track into a PASS by itself.

## 8. Alternatives considered

- **Accept INCONCLUSIVE** for the scored-run-2 microphone track: no rule change; no microphone latency evidence from this run.
- **Rerun microphone capture:** mismatches also appeared in the practice recording (chunk 32, same offset, `discontinuity` close), so a rerun may reproduce one; it needs separate owner approval and a test-duration decision.
- **General rule (X = Y = 960):** the earlier draft; rejected by the owner as wider than the evidence supports.

## 9. Files an implementation would touch (not touched)

- `scripts/gate3-retest/audited_decode_spans.json` (one new row).
- `scripts/gate3-retest/v3a_timing.py` (`placement_interval` / gap-map rows so units inside the overrunning chunk include its excess in the lower bound).
- `scripts/gate3-retest/test_v3a_conditional.py` (or a new test module): tests in section 6.
- `scripts/gate3-retest/README.md` lines 238-247 (describe the second row).
- New pin: regenerate `docs/gates/windows-gate3-v3-preflight-manifest.json` and the freeze surface list (`gate-3-windows-freeze-surface-list-20261109.md`, not read here).
- A new owner approval record naming this change, independent review, and an owner-authorized rescore of scored-run-2 as a new scoring session.

## 10. Risk statement (for the owner)

The row is as narrow as a hash-bound allowance can be and only moves results toward less favourable, by at most 13.5 ms, but it is still a pinned-rule change made after an unfavourable administrative outcome, resting on two events in two recordings. The main risks are an implementation that applies the shift in the wrong direction or omits the inside-chunk lower bound (which would be favourable), a row that quietly matches more than intended, and hiding a real capture fault: an extra-sample event near 106 s in both microphone recordings has no investigated cause. The exact-match rule, the one-way arithmetic, and independent review are the controls; accepting INCONCLUSIVE remains the safe alternative.

## 11. What an independent reviewer should check

1. **Exactness (false PASS):** the new row matches track, rate, both SHAs, seq 47 and both counts exactly, with no fallback to a tolerance, ceiling or other row; 647, 649, negative, other hash, other chunk and `meeting` all raise.
2. **Direction (false PASS):** after the row, no unit's `earliest_acoustic_end_s` rises, no `latest_acoustic_end_s` changes, best-case is unchanged and conservative never decreases; verify against `analyze-bounds.py:29-30` with real numbers.
3. **Inside chunk 47 (false PASS):** units whose placement falls in 106.158-111.138 s (absolute capture clock) include the 648 in the lower bound, and are neither dropped nor given a narrower interval than units after the chunk.
4. **Threshold crossing (false PASS):** a unit just under 3 s or 6 s conservative that crosses with the extra 13.5 ms is reported as a non-PASS, not rounded back.
5. **Counting and overlap (false FAIL):** the 239,688 count comes from the same decode path as the pinned reader and retained ffmpeg and chunk hashes match the manifest; chunk 47's 2.57 ms overlap with chunk 46 together with the overrun clipping neither double counts nor removes the 648 samples from the continuous view.
