# Gate 3 Windows scored-run-2: provisional scoring result (2026-11-10 PST)

**PROVISIONAL, pending owner decisions on eligibility (D1) and spot-check scope (D2). No Gate 3 pass or fail is claimed. The run cannot give a combined Gate 3 verdict while the microphone track is INCONCLUSIVE.** Sanitized: counts, hashes and statuses only; no transcript text or raw data. Evidence stays outside Git in `scored-run-2\` (`scoring-plan.txt`, `scoring-plan-amendment-1.txt`, `scoring-plan-amendment-2.txt`, `scoring-log.md`, `scoring\`). Time zone PST (UTC-8); work 14:44 to 15:31 PST.

## Pins and hashes

Approved manifest `a41e289bd4e5ee8b5a525c6dbb4fca22331a6bce2c9ca663649d1dde52830dc2`; code `76768d5`; docs pin `8426e1cee61c1172a1b1eafeab881942d05a50e7`. Verifier: 14:41 PST and again 15:25 PST (before scoring), both exit 0, `RESULT: PASS`, 288 entries, 0 mismatches. Plan `4452e1b60e64a1bdb0034dee36193e41bef5b3bac5bb5ffb49589a0ed20983c0`; amendment 1 `0072ebb54cb12b192c0beee19c041f606a37bbb71b2cb358a9318b70331c83a7`; amendment 2 `11fe5c39e25252775800266c7a4c04a6911af94c1874b68497cb68646ddee7ed`. Frozen-flag copies: microphone `1fecd6bc...ddeb3f7`, meeting `0a1779bd267254ea6d22bcb56eb7f5e8c07ae617788150349e38e76be56551d6`. Converted meeting publications `fd14af14...c85bad`; matcher output `cfd15523...77bcfb` (hashes identical when re-checked, D6); analysis `984ea60a...2f015df`; sensitivity analysis `111b8a2d...fbd0d9`. Python 3.13.0, matcher script `cdc0698e...8187b`.

## Inputs and observer

Inventory (pinned `make-draft-annotations.py`, mechanical rule): microphone 65 units, meeting 75 units, **0 ineligible** (no reason codes). Observer publications: 7131 samples, 1506 published positions, `result_status` OK, first-sample visible words 0, unmapped labels 0, **`validation_pass` true**. `u_pass` false: 45 of 7130 intervals over 250 ms (max 0.727 s). The 250 ms limit is a reporting threshold only (v3a amendment 4b), not a validity condition; the 75 scored meeting endpoints have max u 0.212 s and none over 250 ms.

## Microphone track: INCONCLUSIVE by the pinned rule (no allowance applied)

Gap map invalid: chunk 47 decoded 239,688 samples against 239,040 declared (+648 samples, 13.5 ms). It is the **only** chunk in either track whose counts differ (microphone 157 chunks, meeting 84). The audited allowance covers only the practice recording's chunk 32 (bound to its metadata and source hashes) and does not apply. The tools' own output for the microphone: latency INCONCLUSIVE, recurrence INDETERMINATE, denominator 65, error "Missing or duplicated scored units" (no converted file, no matcher output). Its sample-continuous marker check is valid (lead 1.440 s, trail 381.465 s, offset disagreement 0.025 s); the legacy timestamped view finds no trail marker. No Layer A was run by hand. For Layer B this means the microphone track's 170-245 s window cannot be judged (INDETERMINATE).

## Meeting track (tools' output)

- Clock and markers: valid. Lead marker 1.405 s, trail 381.405 s in the recording (each +/-0.005 s); offset disagreement 0.0 s (limit 0.1 s); anchor uncertainty 0.0103 s; 46 of 46 long anchors valid, 0 exclusions, 0 unexplained brackets, 0 steps.
- Layer A: **latency PASS** (provisional). Denominator 75; all 75 MATCHED, 75 credited, UNIDENTIFIED 0, CAPTURE-LIMITED 0, TIMING-INCONCLUSIVE 0. Conservative: median 1.547 s, within 6 s 75/75. Best case: median 1.337 s, within 6 s 75/75. Largest conservative latency 4.904 s (no unit over 6 s, no straddle unit).
- Layer B (170-245 s, meeting only): recurrence **NOT OBSERVED**. 19 units have their last word in the window (8 short), all MATCHED, max conservative 4.904 s (the largest of the track; the next are 4.2 s), so no unit is late, missing or UNIDENTIFIED.
- Layer C: tool output "INCONCLUSIVE; automatic event-chain localization not implemented". Not diagnosed.
- UNIDENTIFIED classification: no unit is UNIDENTIFIED; `classify-unidentified.py` was run once and failed because it needs the missing microphone converted file (no code changed).
- Hyphenated word: one of 800 meeting publications (`meeting|02:54|7`) is not a single token and made `occurrence_matcher.py` abort. The matcher is unedited; the evidence-folder helper `match_filtered.py` removed that publication using the filter line copied from the validation-3 dry-run script (`observer-validation-3\regenerated-corrected-parser-20261109\dry3.py`, line 17). The unit it belongs to stayed in the denominator and was still matched on its other words (the tools did not leave it uncredited). **Sensitivity (report only):** the unit chosen by the pre-registered rule (`meeting-031`) set ineligible in a copy gives denominator 74, conservative median 1.545 s, best 1.327 s, 74/74 within 6 s, PASS, NOT OBSERVED: same verdict.

## Anomalies and open items

- `actions.log`: "level meters within 10 s of Record: mic max 0, meeting max 0" (not examined; chunks exist and the meeting track aligned).
- Whether `meeting-031` is the unit the hyphenated word belongs to is by the pre-registered time rule, not verified.
- Chunk 47's overrun and any audited allowance for it are an owner proposal; none is applied.

## Deviations

1. Scorer inventory generated after the run from the pinned tool, mechanical rule, frozen flag set on a copy; the manifest named no scorer-format frozen inventory (annotation files UNFROZEN, eligible null).
2. No signed eligibility rule: Protocol v3 section 2 plus the signed listen-through (CRLF-folded SHA-256 `5a8fb52b...`); the 25 ms / 100 ms spread limits and 12-clip spot-check scope have no recorded approval.
3. Evidence-folder helpers (not in the repo, hashed in the log): `step.py`, `mk_frozen.py`, `convert.py` (failed, wrote nothing), `convert2.py`, `match_filtered.py`, `assemble3.py`, `mk_sens.py`, `chunk_mismatch.py`, `summarize*.py`; `assemble_input*.py` unused. `analyze-input.json` carries `"frozen": true` set by `assemble3.py`.
4. Amendments 1 and 2 (written after failures, before any latency result). The first verifier retry in V2 was an invocation error (quoting) and ran nothing.

**Denominator and eligibility were decided by the mechanical rule after recording; owner review of the eligible/ineligible list is pending.**

## Continuation

Nothing further is authorized. Owner decisions pending: D1, D2; whether to propose an audited allowance for microphone chunk 47; whether the matcher should accept hyphenated words. All files are preserved; the app was not closed.

---

## UPDATE 2026-11-10 (17:24 to 17:34 PST): microphone rescore under the new pin, offline

**No Gate 3 pass or fail is claimed. The owner decides.** Authorization: the owner's recorded approval of manifest `b0a00b68148a66a7dab305a7bcf9a3d2f2e9a993ff134818f7c9fcac680c123d` (code pin `78c9acb`, record `docs/gates/gate-3-windows-mic-allowance-owner-approval-record-20261110.md`, commit `44a90ea`, pushed before scoring). The owner accepted D1 (mechanical eligibility; all 140 units eligible) and D2 (12-clip spot-check as sensitivity evidence only). No new recording, no threshold change, no waiver. Sanitized: counts, hashes and statuses only. Evidence stays outside Git in `scored-run-2\mic-rescore\` (`scoring-plan-amendment-3.txt`, `scoring-log.md`, outputs). The meeting-track section above is unchanged and is the earlier session under the previous pin.

**Pins and hashes.** Own clean checkout of `78c9acb` (`git worktree --detach`, status clean). Verifier 17:24 PST and again after scoring: exit 0, `RESULT: PASS`, 289 checks, 0 mismatches. Plan amendment 3 `5753f5a0da7df950df924022d07b5c4f2625a4af4eda704afcf771bd6e2edffa` (registered 17:27 PST before any step). Converted microphone publications `46480a41...fe236`; matcher output `d1f7da11...eda72` (hashes identical when re-checked three times, D6); combined input `bec2ed7a...1d9dc80`; combined analysis `e080a194...da410d6f1`; microphone gap map `c0c9c11a...811d8ff`. Matcher script `cdc0698e...8187b` (identical in both pins).

**Gap map.** Microphone gap map now **valid**: 157 chunks, chunk 47 (+648 samples, 13.5 ms) is the only chunk whose declared and decoded counts differ, and it is covered by the audited row (audited overrun 648). No other chunk deviates in either track (meeting 84 chunks, 0 differences).

**Meeting regression.** Canonical meeting subtree hash (`sha256` of the sorted, compact JSON of `analysis["meeting"]`; the definition was reproduced from the earlier analysis file) re-derived under the new code in the combined run: `adc8c93013990d32875b64e919cbe2321f5af214efbab0e0c2fea281f682cd76`, **equal** to the required value. Meeting result unchanged: Layer A PASS, Layer B NOT OBSERVED.

**Microphone clock and markers.** Valid. Lead marker 1.440 s, trail 381.465 s (each +/-0.005 s); offset disagreement 0.025 s (limit 0.1 s); 40 of 40 long anchors valid, 0 exclusions, 0 steps.

**Microphone Layer A (primary): PASS.** Denominator 65; MATCHED 60 + BOUNDED 2 credited (62), UNIDENTIFIED 2, CAPTURE-LIMITED 1, TIMING-INCONCLUSIVE 0. Conservative: median 1.544 s, 62/65 (95.4%) within 6 s. Best case: median 1.254 s, 62/65. Both bounds pass (95% needs 62 of 65). The margin is exactly the three uncredited units, so one more failure would have failed it. No straddle units.
**Hyphen filter.** The filter removed 4 microphone publications (rows 02:39 and 06:11); the units they belong to by the pre-registered time rule (`microphone-023`, `microphone-063`; rule-based, unverified) stayed in the denominator and were MATCHED on their other words. Sensitivity (report only; both units set ineligible in a copy): denominator 63, conservative median 1.552 s, 60/63 within 6 s, best median 1.265 s, 60/63: PASS, recurrence FAILURE OBSERVED, same verdicts. Sensitivity analysis `76311b09...b17edc`.

**Combined Layer A (the protocol defines Layer A per track).** Meeting PASS and microphone PASS. For information only, not protocol-defined: all 140 units pooled, conservative median 1.545 s, 137/140 (97.9%) within 6 s; best case median 1.307 s, 137/140.

**Layer B (170-245 s window; either track).** **FAILURE OBSERVED**, driven by the microphone. Microphone: 18 window units (8 short), 17 MATCHED and 1 UNIDENTIFIED (`microphone-029`, source time 185.27 to 185.84 s) -> FAILURE OBSERVED. Meeting: 19 units, all MATCHED -> NOT OBSERVED. Other microphone UNIDENTIFIED unit outside the window: `microphone-050` (285.8 to 292.9 s). Largest finite microphone conservative latency 4.566 s (`microphone-025`), next 4.043 s.

**Layer C.** Tool output "INCONCLUSIVE; automatic event-chain localization not implemented"; not diagnosed by hand. **`classify-unidentified.py` could not run**: it aborted (ValueError, exit 1, no output) on the hyphenated meeting publication `meeting|02:54|7`, the same defect that stopped the matcher earlier; its alignment call has no filter. That is a code defect, not an invocation error, so the step was stopped (not worked around). The two UNIDENTIFIED microphone units are therefore unclassified.

**Around chunk 47 (106.158 to 111.138 s).** Units overlapping the span: `microphone-014` (MATCHED, conservative 1.151 s) and `microphone-015` (CAPTURE-LIMITED, uncredited; tool reason: no energy above both levels on both sides of the capture event at 111.144 s, "capture/measurement limitation, not an app-output failure"). Of 62 units with a finite conservative latency, 48 have their earliest acoustic end at or after the chunk start; the worst of them is 4.566 s, 1.434 s from the 6 s limit. No unit after chunk 47 came closer than that.

**Anomalies.** (1) Layer B FAILURE OBSERVED rests on one UNIDENTIFIED unit that could not be classified. (2) The Layer A margin is exactly 3 uncredited units of 65. (3) One of those, `microphone-015`, is flagged by the tool's capture-limited rule at 111.144 s, next to the uninvestigated recurring capture event near 106 s. (4) The hyphen-filter defect now blocks the classifier as well as the matcher. (5) Chunk-check output file in the log shows MISSING because it was saved after the step by a pipe, not by the step.

**Deviations.** Evidence-folder helpers (not in the repo, hashed in the log): `step.py`, `convert_mic.py`, `match_filtered.py`, `assemble_combined.py`, `mk_sens_mic.py` (unused), `mk_sens_mic2.py` (multi-row; added after registration because two rows were filtered), `check_meeting_hash.py`, `chunk_check.py`, `summarize_mic1..4.py`. The meeting conversion and matcher outputs were reused from the earlier session, not regenerated. One invocation/helper error (incomplete helper edit, SENS steps failed with no outputs, rerun; register A-079).

**Continuation.** Nothing further is authorized. Owner decisions: whether to allow a filtered variant of the classifier for the two UNIDENTIFIED microphone units (new unplanned helper), whether the matcher and classifier should accept hyphenated words, and what the combined reading means for Gate 3.

---

## UPDATE 2026-11-10 (17:45 to 17:51 PST): diagnostic classification of the two UNIDENTIFIED microphone units

**Diagnostic only; no verdict, threshold, pinned file or earlier output changed; no Gate 3 pass or fail is claimed.** Owner authorized a filtered classifier variant in chat. Plan amendment 4 `9b08ad82...c44fbae` (registered 17:48 PST before any step); new helper `filter_converted.py` (documented hyphen filter, line 17 of the validation-3 dry-run script, applied to hash-checked copies of the two converted files; removed 1 meeting and 4 microphone publication ids). Verifier before and after: `RESULT: PASS`, 289 checks, 0 mismatches. `classify-unidentified.py` ran once, exit 0. Output (contains reference text, stays in the evidence folder `mic-rescore\classifier-run\`): `2d0b4022...`; filtered copies meeting `2f9f2b14...`, microphone `1e88a241...`. Classifier counts: microphone 2 UNIDENTIFIED (class a 1, class c 1), meeting 0. Classes are heuristic.

| Unit | Recording position (acoustic end) | Class (heuristic) | Numbers behind it |
| --- | --- | --- | --- |
| `microphone-029` (short, 1 word) | 185.83 s, inside 170-245 s | c: rows present, different words displayed where the source word should be | tree and published coverage 0.00; first row sample at 188.3 s (about 2.5 s after the acoustic end); 2 rows ever in viewport; max u 0.189 s; uncovered speech 0.0 s |
| `microphone-050` (16 words) | 292.83-292.92 s, outside the window | a: the tail holding the final word is not displayed anywhere (its row never entered the tree) | tree coverage 0.88, published 0.69; first row sample 287.9 s; 3 rows ever in viewport; max u 0.139 s; uncovered 0.2 s |

**Context from existing outputs.** Neighbours' conservative latencies (3 before, 3 after), all MATCHED: `029`: 2.71, 1.84, 2.75 s | 2.89, 2.17, 3.80 s (the 3.80 s is `microphone-032`). `050`: 1.16, 1.23, 1.77 s | 1.27, 1.21, 1.28 s. So both units sit among normal-latency neighbours. Observer within a few seconds of the expected time: `029` yes, a 10-publication row (`microphone|03:02|*`) first observed 2.47 s after the acoustic end, and the matcher kept its position 9 as the single candidate, but the displayed word differs from the source word, so it is not credited; `050` essentially no: the only publication within +8 s is one from a later row (`04:55`) at +3.82 s, no candidate. Matcher: no single-word substitution recorded for either (`MATCHED-SUBSTITUTED` needs at least 3 reference words; `029` has 1; `050` has 0.00 other-word agreement and "endpoint deleted in the optimal alignment"). Microphone window 170-245 s: 18 units (8 short): 17 MATCHED, 1 UNIDENTIFIED (`029`); the slowest MATCHED unit there is `microphone-025` at 4.566 s conservative.

**Reading.** Layer B FAILURE OBSERVED in the microphone rests on `microphone-029`, one short single-word unit whose row appeared on time but showed a different word. The classifier labels it a recognition difference (class c), not a late publication. That label is a heuristic; the verdict stays as the tools reported it.
