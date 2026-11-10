# Gate 3 Windows scored-run-2: scoring STOPPED before any verdict (2026-11-10 PST)

**PROVISIONAL, pending owner decision on eligibility (D1) and spot-check scope (D2). No Gate 3 pass or fail is claimed. Scoring did not complete: no Layer A, B or C result exists.** Sanitized: counts, hashes and statuses only; no transcript text or raw data. Evidence stays outside Git in `scored-run-2\` (`scoring-plan.txt`, `scoring-plan-amendment-1.txt`, `scoring-log.md`, `scoring\`).

## Pins and verifier

Approved manifest SHA-256 `a41e289bd4e5ee8b5a525c6dbb4fca22331a6bce2c9ca663649d1dde52830dc2`, code `76768d5`, docs pin `8426e1cee61c1172a1b1eafeab881942d05a50e7`, checkout `scrb-run-pin`. Verifier at 14:41 PST: exit 0, `RESULT: PASS`, 288 entries, 0 mismatches. `scoring-plan.txt` SHA-256 `4452e1b60e64a1bdb0034dee36193e41bef5b3bac5bb5ffb49589a0ed20983c0` (recorded before step P1). `scoring-plan-amendment-1.txt` SHA-256 `0072ebb54cb12b192c0beee19c041f606a37bbb71b2cb358a9318b70331c83a7`. Time zone PST (UTC-8); work 14:44 to 14:57 PST.

## What ran (all exit 0 unless stated)

- S1 inventory from the pinned `make-draft-annotations.py` on the frozen r3-derived-1 assembly: microphone 65 units (39 long, 26 short), meeting 75 units (45 long, 30 short). **Eligible 65/65 and 75/75; ineligible 0** (no reason codes occurred). Originals: microphone `ea3f0b91...693c9`, meeting `f96d1911...f38aa0` (full values in the log).
- S2 copies with only `frozen: false -> true` (script `mk_frozen.py`): the line diff of each copy against its original is exactly that one line. Copies: microphone `1fecd6bc5cc82d8d1886d88d4911e1bf38ea6be44c197aff2e0a961f7ddeb3f7`, meeting `0a1779bd267254ea6d22bcb56eb7f5e8c07ae617788150349e38e76be56551d6`.
- P1 observer publications (`observer_publications.py`): 7131 samples, 1506 published word positions, `result_status` OK, first-sample visible words 0, unmapped label rows 0, **`validation_pass` true**. `u_pass` false as a reporting threshold only: 45 of 7130 intervals over 250 ms (max 0.727 s; 13 published positions over 250 ms, max 0.401 s); pre-viewport interval 11.4 s (not counted).
- P2 conversion to recording time: **microphone gap map INVALID** (`Inconsistent timestamp/sample-count record outside audited span allowance`). One microphone chunk (seq 47) decoded 239688 samples against 239040 declared (+648 samples, 13.5 ms); the only audited allowance is bound to the practice recording's chunk 32. Under the pinned v3a rule this makes microphone timing INCONCLUSIVE (fail closed). Meeting gap map valid (84 chunks, 0 mismatches); 800 meeting words converted (`convert2.py`, plan amendment 1).
- **P3 occurrence matcher (meeting): exit 1, STOP.** `occurrence_matcher.py` raises `ValueError: Each publication must identify one visible word position` for one hyphenated published word out of 800 meeting words (two normalized tokens) and writes no output. The validation-3 dry run avoided this by filtering such words ("dry-run only"). Filtering is a code or data change, so per the brief I stopped. P4 to P8 did not run.

## Results

Clock and marker results, Layer A (verdict, medians, 6 s fractions, denominators, UNIDENTIFIED / CAPTURE-LIMITED / TIMING-INCONCLUSIVE counts), Layer B, Layer C and the UNIDENTIFIED classification: **not produced**. Sensitivity analysis with ineligible units included: not run, because there are no ineligible units (it would equal the primary by construction). Layer C has no pinned tool (it needs the app diagnostic trace). The first-video-frame check is the owner's and does not gate scoring. Level meters logged within 10 s of Record read `mic max 0, meeting max 0` in `actions.log`; the captured chunks exist, but this has not been examined.

## Deviations

1. Scorer annotation inventory generated after the run from the pinned tool, mechanical rule, frozen flag set on a copy; the manifest named no scorer-format frozen inventory (manifest annotation files say UNFROZEN, eligible null).
2. No signed eligibility rule: Protocol v3 section 2 plus the signed listen-through (CRLF-folded SHA-256 `5a8fb52b...`) used; the 25 ms / 100 ms spread limits and the 12-clip spot-check scope have no recorded approval.
3. Helper scripts in the evidence folder (not in the repo): `step.py`, `mk_frozen.py`, `convert.py` (failed at the microphone, wrote nothing), `convert2.py`, `assemble_input.py` and `assemble_input2.py` (the last two unused); hashes in `scoring-log.md`.
4. Plan amendment 1 (converting only tracks with a valid gap map) was written after P2 failed and before any latency result existed.

**Denominator and eligibility were decided by the mechanical rule after recording; owner review of the eligible/ineligible list is pending.**

## Decisions needed from the owner

- Microphone: may a +13.5 ms overrun on chunk 47 be covered by an audited allowance (a rule change), or is the microphone track INCONCLUSIVE for scored-run-2?
- Meeting: how to handle a hyphenated published word that the matcher rejects (code change to the matcher, or a documented exclusion of that one word). Neither was applied.

## Continuation (nothing is authorized beyond scoring)

Preserved state: all files under `scored-run-2\scoring\`; the app was not closed; nothing was deleted. After the owner's decisions, resume at P3 with the frozen-copy inventories and `timestamped-meeting.json` as hashed in the log, then P4 to P8 of the plan.
