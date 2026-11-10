# Gate 3 Windows: proposed audited sample-count allowance (PROPOSAL ONLY)

Status: **PROPOSED, not approved, not implemented.** Drafted 2026-11-10 by Claude Code (Sonnet 5.5) under an owner drafting-only authorization. Nothing pinned, scripted, tested, scored or classified was changed or run to produce this. It needs independent review (below) and explicit owner approval before any change.

## 1. Blindness statement

The allowance is sized from capture facts only: chunk metadata (`chunks.json`) and decoded sample counts. It was drafted **without reading any scored-run-2 latency, recurrence or classification result**. Nothing was scored, matched, timed, analyzed or classified.

Files and data actually read:

- `scripts/gate3-retest/v3a_timing.py` (lines 60-315), `scripts/gate3-retest/audited_decode_spans.json`, `scripts/gate3-retest/README.md` (lines 232-247), `scripts/gate3-retest/test_v3a_conditional.py` (grep lines only), `scripts/gate3-retest/marker_clock.py` (grep lines only).
- Chunk metadata and the `.opus` chunks (decoded with the retained ffmpeg) for six tracks, listed in section 2.
- Runbook `docs/gates/gate-3-windows-scored-run-runbook-20261110.md`: grep output only (three matching lines about evidence paths).
- The tails of `agents/agent_self_induced_failures.md` and `agents/agent_task_allocation.md`.

**Disclosure of an unintended exposure:** the tail of `agents/agent_task_allocation.md` displayed the existing usage row for the scored-run-2 continuation. It states, in summary, that the meeting track latency was provisionally PASS with recurrence NOT OBSERVED, and the microphone track INCONCLUSIVE at chunk 47. A grep also returned the heading of register entry A-057. No microphone latency, recurrence or per-unit value was seen, and the file `docs/handoffs/2026-11-10-gate3-windows-scored-run-2-result.md` and all scoring outputs were not opened. The reviewer should weigh this: the reader of this proposal knows the meeting track is not the blocker. It did not influence the sizing, which follows from the section 2 numbers. Logged as A-058.

## 2. Observed facts (capture facts only)

Method: declared = `round(endNs*rate/1e9) - round(startNs*rate/1e9)` from `chunks.json` (same formula as `gap_map`); decoded = frames from the retained ffmpeg decode of each `.opus` file (the pinned pipe-WAV method in `load_views`). The decoder was `gate3-integrated-evidence\decoder\ffmpeg.exe`, SHA-256 `e41cab268e561618eacd9b9190134464f87eded52327bdb0d2a4576b220ec030`, version 9.0. The method reproduces the existing audited value exactly (practice chunk 32: 47520 declared, 47688 decoded). An earlier attempt using Ogg granule positions did not reproduce it (it reported no mismatches anywhere) and was discarded.

Evidence root: `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\`.

| Recording / track | chunks.json SHA-256 | Chunks | Mismatching chunks | Seq | Declared | Decoded | Diff (samples) | Diff (ms @ 48 kHz) | Offset in recording (s) | Chunk length (s) |
|---|---|---|---|---|---|---|---|---|---|---|
| scored-run-2 microphone | `fa595b9d5e75ccf04b6424c4e7fc423d1cca15c06652ec58a75ca16d525a2bd1` | 157 | 1 | 47 | 239040 | 239688 | +648 | +13.5 | 106.149 | 4.98 |
| scored-run-2 meeting | `d5b12853756ca73b75c300317d50204f65eb5ba9885b72f6d89221df8085842a` | 84 | 0 | | | | | | | |
| practice-d2 microphone | `c99682505f904e801d9f288d963f4407ca1a2eb39d092eebb8efc3b6afd87290` | 139 | 1 | 32 | 47520 | 47688 | +168 | +3.5 | 106.062 | 0.99 |
| practice-d2 meeting | `20a5ad7d4ac741f0fdfb5ace8b1bd007b11e1d0d51a421bd87cb79fdc812d176` | 91 | 0 | | | | | | | |
| rehearsal-1 microphone | `4dfa6080f7727b04665d358847ece54f2b29b5ff7d62e0ffc6461fea7a4f1a69` | 26 | 0 | | | | | | | |
| rehearsal-1 meeting | `24486d73825cb2b508ac397acf5a184d4938cccb6f851b62e416d69eb64345d7` | 12 | 0 | | | | | | | |

Note on the offset column: offset is `chunk.startNs - firstChunk.startNs` in seconds. Scored-run-2 chunk 47 starts 106.149 s after the first chunk start (its absolute `startNs` is 106,158,295,700; the first chunk's is 8,842,500). The "chunk 47 at 106.158-111.138 s" figures elsewhere are absolute capture-clock values. Practice chunk 32 starts 106.062 s after the first chunk start (absolute 106,062,655,400).

Source SHA-256 of the two mismatching chunks: scored-run-2 mic chunk 47 `418e75c4c1f60fa28d7e197955eae1042d9ecf6d4251fa7eafc8b3be3a80f41a`; practice mic chunk 32 `86198be2632f2435a0044ee702401601a9d1e5af520916186b738a6d8d9f4571` (matches the existing allowance).

Exists / does not exist:

- Exist, read: scored-run-2 (`scored-run-2-app`), practice-d2 (`practice-d2\app-run`), rehearsal-1 (`rehearsal-1-app`).
- The practice recording is the one the existing allowance was derived from (metadata SHA `c99682...7290` equals the allowance's `metadata_sha256`). No other recording was found to derive it from.
- `scored-run-1-app`: exists as a folder but contains **no** `chunks.json`; not examined. Other earlier-gate recordings were not searched (out of scope; not guessed).

Further capture facts about the two mismatching chunks (metadata only):

- Both are microphone chunks, both near 106 s from the start, both open and close on a `discontinuity` (chunk 32 opens on `rollover`, closes on `discontinuity`; chunk 47 opens and closes on `discontinuity`). The practice meeting, scored meeting and rehearsal-1 tracks have zero mismatches.
- Chunk 47 is much longer (4.98 s) than the 10 ms neighbours 46 and 48 (`discontinuity` chunks at 106.150863 s and 111.140793 s). Chunk 46 ends 106.160863 s, 2.57 ms after chunk 47 starts (a timestamp overlap of 2.57 ms); chunk 48 starts 2.50 ms after chunk 47 ends (a gap).
- The mismatch is always decoded > declared. No negative mismatch exists in any inspected track.
- Neither mismatch is a whole number of 20 ms Opus frames (168 and 648 samples against 960 per frame).

Not determined here (needs data this draft may not use): whether any scored unit's anchor lies inside chunk 47 (offset 106.158-111.138 s of the capture clock). That requires matcher placements. The proposal therefore does not depend on it (section 4).

## 3. The existing rule and allowance

- Pinned rule, `scripts/gate3-retest/v3a_timing.py:147-149` in `gap_map`:
  `overrun = audited_overrun(record, track, rate, metadata_sha256, end-start)` then
  `require(count > 0 and end > start and count-(end-start) == overrun, 'Inconsistent timestamp/sample-count record outside audited span allowance')`.
  Any other decoded-minus-declared difference, either sign, raises and the track gap map is invalid (INCONCLUSIVE).
- Allowance: `scripts/gate3-retest/audited_decode_spans.json`, one row: microphone, metadata SHA `c99682505f904e801d9f288d963f4407ca1a2eb39d092eebb8efc3b6afd87290`, source SHA `86198be2632f2435a0044ee702401601a9d1e5af520916186b738a6d8d9f4571`, seq 32, rate 48000, declared 47520, decoded 47688, overrun 168. `audited_overrun` (lines 108-115) returns the overrun only on an exact match of track, rate, both SHAs, seq and both counts, else 0. README lines 238-247 state the same and add "no generic numerical count or gap cutoff".
- What is done with the excess (`v3a_timing.py`, `gap_map` and `placement_interval`):
  - Nothing is excluded and no offset is corrected. The continuous view keeps every decoded sample (`continuous += count`).
  - The legacy timestamped view clips the chunk to its declared end (`timestamped[a:b] = block[:b-a]`, lines 244-245).
  - `cumulative_overrun_samples` and `decoded_overrun_samples` are recorded per row (lines 155-161). `timestamp_displacement_samples = start - continuous` (line 160) therefore falls by the overrun for every **later** chunk.
  - `placement_interval` (lines 249-261) returns `[seconds + min(0, shift)/rate, seconds + max(cumulative_gap, shift)/rate]`. A negative shift (from overlaps and overruns) lowers only the **low** end, so the allowance widens the interval and leaves the high end alone.
  - Observation for review: for the overrunning chunk's own row, `shift` is the displacement *before* that chunk, so a placement inside chunk 47 does not yet receive its own -648 samples at the low end (see check 2).
- `marker_clock.py` only calls the gap map and reports `latency: INCONCLUSIVE` when it is invalid (lines 202-207); it contains no allowance logic of its own.

## 4. Proposed rule

**Rule M-1 (proposed).** A chunk's decoded sample count may exceed its declared span, and the track's gap map stays valid, only if **all** hold:

1. decoded - declared is strictly positive and **at most X = 960 samples (20 ms at 48 kHz)**, in that one chunk;
2. the **sum of such excesses over the track is at most Y = 960 samples (20 ms)**, so at most one chunk of the largest permitted size, or several smaller ones; this applies per track, per recording, to both tracks equally;
3. the excess is recorded in the gap map exactly as the chunk-32 overrun already is (decoded overrun, cumulative overrun), together with chunk seq, source SHA and metadata SHA, so every use is auditable in the output;
4. the placement interval is widened as in section 5.

Still INCONCLUSIVE, unchanged: any decoded < declared (negative) mismatch; any excess over 960 in one chunk; a track total over 960; any non-integer or missing count; the existing identity checks (duplicate or reordered timestamps, missing source identity, embedded timestamp mismatch). The chunk-32 row stays as is and keeps its own hash binding; its 168 samples count toward the practice recording only, not toward scored-run tracks.

Why these numbers and not larger: the observed values are 168 and 648 (one per track, one per recording). X = 960 is 1.48 times the largest observed value (648) and exactly one Opus frame (20 ms), the natural unit at which a decoder could add or drop one frame. A margin of one frame is enough to cover rounding of timestamps (the declared span is `round(...)` on both ends, so a difference of 1-2 samples from rounding alone cannot matter) and is small against the 3 s and 6 s thresholds (0.67 percent and 0.33 percent). A larger X (for example 100 ms) would be a general tolerance chosen with no observed case that needs it; it would also hide a genuinely lost or duplicated audio frame. Y equals X so the total over a track can never exceed what one frame could hide: the observed value (648) leaves 312 samples of headroom, i.e. a second mismatch is accepted only if it is tiny. This is deliberately tight; if the reviewer thinks a second ~13 ms event is plausible and acceptable, Y could be raised, but no data in section 2 supports that.

## 5. How the allowance is applied (widen only, never favourable)

Let M be the accepted excess samples of a chunk (M <= 960) and r the sample rate. Interval arithmetic, using the existing formula:

- Every chunk after the overrunning chunk has `shift' = shift - M` (shift is `timestamp_displacement_samples`).
- Low end: `min(0, shift') <= min(0, shift)`, lowered by at most M/r seconds.
- High end: `max(cumulative_gap, shift')`. `cumulative_gap` is unchanged by an overrun and `shift' <= shift`, so the high end is unchanged or lower than the zero-allowance reading by nothing (it cannot rise).
- A unit's latency is its recording placement minus its source time. Consequently:
  - the **conservative (highest-latency)** estimate changes by **0**;
  - the **best-case (lowest-latency)** estimate falls by **at most M/r**, i.e. at most **13.5 ms** for the observed 648 and at most **20 ms** by the proposed ceiling; it can never rise;
  - the interval therefore only widens. The allowance cannot make any estimate more favourable than the pre-allowance continuous reading.
- Required addition (not in current code): for units whose placement falls **inside** the overrunning chunk, the low end must also include `-M`, because it is unknown where in the chunk the extra samples sit. Equivalently, within such a chunk use `shift' = shift - M` for the low end.
- Arithmetic statement for the 3 s and 6 s thresholds (not a result): the allowance can move any best-case value by at most 13.5 ms (<= 20 ms at the ceiling) and any conservative value by 0. A unit whose best-case latency is within 13.5 ms above a threshold could change from a best-case fail to an uncertain reading; a unit whose conservative latency is at or below a threshold remains at or below it. No other unit's status is affected by the allowance.

## 6. Required tests (not written here)

In `scripts/gate3-retest/test_v3a_conditional.py` or a new test module, with synthetic records:

1. +648 samples (+13.5 ms) in one microphone chunk passes under M-1; the gap map is valid, records overrun 648, and every later chunk's displacement falls by 648.
2. +960 passes; **+961 fails** with the existing error text.
3. -1 sample (negative mismatch) fails; a larger negative mismatch fails.
4. A second excess chunk fails when the track total would exceed 960 (for example 648 then 313), and passes when it does not (648 then 312).
5. The existing chunk-32 case behaves as before: only the hash-bound 168 row, 167 and 169 fail on that row's identity, and `audited_overrun_samples == 168` for the practice mapping.
6. The same rule applies unchanged to the meeting track (same tests with `track='meeting'`).
7. Widening tests: for a unit after the overrun, low end falls by M/r, high end is unchanged; for a unit inside the overrunning chunk, low end includes -M; nothing moves later; `best_case >= pre-allowance best_case - M/r` and `conservative == pre-allowance conservative`.
8. Real-evidence check, run only after approval: gap maps for the two scored-run-2 tracks, practice and rehearsal-1 are valid and record exactly the section 2 excesses.

## 7. Precedent and honesty

- This is a **rule change proposed after seeing the data**, after a pinned rule marked the scored microphone track INCONCLUSIVE. That is the pattern a pinned rule exists to prevent, and the owner should treat it with that suspicion.
- Why the outcome cannot steer it: the sizing uses only chunk metadata and decoded counts (section 2). No latency, recurrence or classification result was consulted (section 1 lists the one unintended exposure and what it did and did not reveal). The proposed X and Y would be the same whether the microphone result turned out to be a PASS or a FAIL, because widening-only arithmetic (section 5) makes every unit's conservative latency independent of the allowance.
- It applies equally to the meeting track (zero mismatches there so far, so it changes nothing for that track today).
- It would **not** fix: any larger or negative mismatch; any other kind of gap-map invalidity; ambiguous or missing anchors; the question of why the capture produces extra decoded samples at about 106 s in both mic recordings (a recurring pattern in two of two microphone recordings with a `discontinuity` close; root cause not investigated); the meeting-track or any other open owner decision; and it does not convert an INCONCLUSIVE track into a PASS by itself, since scoring would still have to be rerun and judged on its own.

## 8. Alternatives considered

- **Accept INCONCLUSIVE** for the microphone track. Zero rule risk and no precedent; the cost is that the microphone track of this scored run yields no latency evidence, and a repeat of the same capture behaviour would keep doing so.
- **Rerun the microphone capture.** Mismatches also appeared in the practice recording (chunk 32), at almost the same offset (106 s) and with a `discontinuity` close, so a rerun may reproduce one. It would also be a new recording and a new scored run needing separate owner approval and (per project rules) a test-duration decision.
- **Per-recording hash-bound row only** (add chunk 47 beside chunk 32). Narrowest, but it is the same after-the-fact exemption keyed to one result and gives no protection against the next occurrence; offered as a fallback if the owner prefers no general rule. Its tests and widening requirement are the same as above.

## 9. What changing it would require (none of it done)

- Edit `scripts/gate3-retest/v3a_timing.py` (`audited_overrun`, `gap_map`, and the inside-chunk widening in `placement_interval`), and `audited_decode_spans.json` or a new policy file if the rule is expressed as data.
- Add the tests in section 6 to `scripts/gate3-retest/test_v3a_conditional.py` (or a new module); update `scripts/gate3-retest/README.md` lines 238-247, which currently say there is no generic cutoff.
- New pin of the changed scripts and policy file, regeneration of `docs/gates/windows-gate3-v3-preflight-manifest.json` and the freeze surface list (`docs/gates/gate-3-windows-freeze-surface-list-20261109.md`, not read here), per the existing freeze process.
- A new owner approval record (the previous one is `docs/gates/gate-3-windows-owner-approval-record-20261110.md`, not read here) naming this rule change, plus independent review.
- A rescore of scored-run-2 under the new pins (owner-authorized), recorded as a new scoring session, not as a continuation of the old one.

## 10. Risk statement (for the owner)

The change is small in size and mathematically widening-only, but it is a pinned-rule change after an unfavourable administrative outcome, and the data behind it are two events in two recordings. The main risks are (a) precedent: later rule changes after seeing outcomes become easier to justify; (b) an implementation that widens the wrong way or applies the shift at the wrong chunk, which could move a latency estimate in the favourable direction; and (c) hiding a real capture fault: a recurring extra-sample event at about 106 s in both microphone recordings may indicate a capture or timestamp defect that the allowance would quietly accommodate within 20 ms. The cap, the equal treatment of both tracks, the recorded audit fields and the independent review are the controls. If the owner is uncomfortable with any of them, accepting INCONCLUSIVE is the safe option.

## 11. What an independent reviewer should check

1. **Direction of the shift (false PASS):** confirm in code, with a test on real numbers, that after the allowance no unit's conservative latency decreases and no placement moves later than before; check both `timestamp_displacement_samples` signs and the `min`/`max` in `placement_interval`.
2. **Inside the overrunning chunk (false PASS/false FAIL):** current code uses the displacement before the chunk for units inside chunk 47. Confirm that the unknown position of the extra 648 samples is covered on the low side by `-M`, and that units with their anchor in chunk 47 (106.158-111.138 s) are neither dropped nor given a narrower interval than units after it.
3. **Limits (false PASS):** confirm that X and Y are enforced per chunk and per track (a second chunk at the limit, +961, total > 960 and any negative mismatch all raise), and that the sum counts the chunk-32 row only for the practice recording and cannot be reset by splitting or reordering records.
4. **Sample counting (false FAIL or PASS):** confirm that the section 2 counts come from the same decode path as the pinned reader (an earlier granule-based count in this draft gave no mismatches and was wrong), and that the retained ffmpeg and chunk hashes match the manifest.
5. **Overlap with timestamps (false FAIL):** chunk 47 also overlaps chunk 46 by 2.57 ms at the start; confirm the overlap handling (`overlap_before_samples`, last-chunk-wins in the legacy view) and the overrun clipping together do not double count or remove the 648 samples from the continuous view.
