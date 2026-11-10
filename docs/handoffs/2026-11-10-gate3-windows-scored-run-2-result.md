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
