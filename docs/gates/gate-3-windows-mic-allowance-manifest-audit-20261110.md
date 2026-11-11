# Gate 3 Windows: independent audit of the microphone chunk-47 freeze pin (2026-11-10)

**Verdict: AUDIT PASS** (no false-PASS path, no false-FAIL path, no run-binding gap found; six non-blocking wording or scope findings below). This is an audit only: no approval record was written, no script, test, manifest or sheet was edited, and no microphone scoring, matcher, timing or classify was run on any evidence. Auditor: Claude Code (Sonnet 5.5), not the author of the pin. 16:58 to 17:10 PT. Work was done in a scratch clone, not the author's pin checkout.

Subject: branch `rosmont/windows-gate3-mic-allowance-20261110`, code and documents pin `78c9acb`, manifest committed at `9d6e6d9`.

## 1. Manifest hash
`git show 9d6e6d9:docs/gates/windows-gate3-v3-preflight-manifest.json` = `b0a00b68148a66a7dab305a7bcf9a3d2f2e9a993ff134818f7c9fcac680c123d`, identical with and without CR folding (the file has no CR). Equals the claim and the value in the approval sheet. The old approved manifest (`574616b`) recomputes to `a41e289b...830dc2` as stated.

## 2. Entry hashes
- Own script (git show of each entry, nothing taken from the author's scripts): 154 hash-bearing entries; 103 are `git-show-blob-bytes` (26 documents, 71 scripts, 3 run_binding, 1 classification, 1 capture_equivalence, 1 native package-lock). **103 checked, 0 mismatches.** 102 at the pin; the package-lock entry names commit `553dd90` and matches there. The other 51 are `raw-file-bytes` of private evidence outside git; my script did not hash them (the verifier did).
- `verify-against-manifest.py` from a clean checkout of `78c9acb` (status empty before and after) with the claimed hash: **289 checks, 0 mismatches, PASS**. Wrong hash (the old `a41e289b...`): exit 1, FAIL, 288 checks, 1 mismatch. All-zero hash: exit 1, FAIL, 1 mismatch.

## 3. Manifest diff against the old one (`574616b`)
- Entries removed: 0. Entries added: 1 (`gate-3-windows-mic-sample-count-allowance-proposed.md`). Entries changed: exactly 4 `sha256` (README.md, audited_decode_spans.json, test_v3a_conditional.py, v3a_timing.py).
- `git_commit_id` changed on 101 entries (`8426e1c` to `78c9acb`); no other entry field changed.
- Non-entry fields changed: `status`, `pins.final_code_sha`, `pins.final_code_sha_note`, `pins.doc_pin_commit`, `pins.doc_pin_note`, `test_results.run_at`, `test_results.python.note`, `.ran` and `.passed` (350 to 356), `inventory_counts.documents` (25 to 26). Added: `test_results.powershell_parse.carried_from_previous_pin`, `test_results.npm_run_check.carried_from_previous_pin`.
- Anything else: nothing. `pins.branch` was NOT updated (see F4).

## 4. Code diff `bc78851..78c9acb`
Seven files: the four expected script/README files, the added proposal, and the two log files `agents/agent_self_induced_failures.md` and `agents/agent_task_allocation.md` (register and usage tracker). No other code or script changed. The expected six are the four plus the proposal plus the logs counted as one; the logs are not pinned code (F6 is unrelated).
- `audited_decode_spans.json`: one added row; the seven identity fields match the proposal exactly (track microphone, rate 48000, metadata `fa595b9d...2bd1`, source `418e75c4...f41a`, seq 47, declared 239,040, decoded 239,688, overrun 648 = 239,688 - 239,040). I compared the hashes by string match against the proposal text. `audited_overrun` is unchanged and still exact-match-or-zero, so there is no tolerance path.
- `v3a_timing.py`: one line. Lower bound is `min(0, displacement - decoded_overrun)` over rows chosen by continuous-sample membership (unchanged selection); upper bound line untouched; `decoded_overrun_samples` is per chunk (0 elsewhere), so later chunks are not double counted. Matches proposal sections 4, 5 and 9.

## 5. Suite at the pin (clean checkout, Python 3.13.0, `discover -s . -p "test_*.py"`)
- With `SCRB_V3A_PRACTICE_ROOT` and `SCRB_MATCHER_DIR` set as the manifest names: **356 run, OK, 0 skipped.**
- Without: **356 run, OK, skipped=3.**
- The clean checkout holds the OLD manifest at the manifest path, so the "real manifest" tests there read the old file. I copied the checkout, overlaid the new manifest, and ran `test_verify_against_manifest.py`: 22 tests, OK (F5).

## 6. Owner approval sheet (`docs/gates/gate-3-windows-mic-allowance-owner-approval-sheet-20261110.md`)
Present and correct: authorizes only offline microphone rescore from the existing recording (section 3); no threshold change, waiver or Gate 3 claim (section 4); the after-the-data nature (section 5, first risk); both pins and the combined verdict citing both (section 6); the approval block is EMPTY (all four lines blank); "289 checks, 0 mismatches", exit 1 on wrong hash and the 356 / 0 / 3 skip counts match my runs.

## 7. Findings (none changes a verdict path)
- **F1 (overstates approval).** Manifest role text, the `audited_decode_spans.json` audit_reference and sheet section 1 call the proposal "approved", but the proposal's own header still reads "PROPOSED, not approved, not implemented". The approval was a ChatGPT review (APPROVE), not an owner approval; the owner's decision is only the empty block.
- **F2 (understates change).** Sheet section 1 says nothing else changed "except the pin fields and the test counts". Also changed: `status`, 101 `git_commit_id` fields, test-result text and two new `carried_from_previous_pin` fields.
- **F3 (inaccurate mechanism).** Sheet section 1 says the fix "lets the scorer use that earlier value instead of rejecting the file". The row prevents the rejection; the fix widens the lower bound for units inside chunk 47 (and any row with a nonzero accepted overrun).
- **F4 (stale field).** `pins.branch` still says `rosmont/windows-gate3-integration-2-20261109`; `npm_run_check.boundary_check` names that branch; `final_code_sha_note` cites the previous manifest as the 8-digit `a41e289b...` although the manifest rules require full digests.
- **F5 (wording).** `test_results.run_at` says the clean-checkout Python run read "this manifest, which is not in the pin"; an older version of that file is in the pin, so the real-manifest tests of a clean checkout read the old manifest (verified passing with the new one overlaid).
- **F6 (scope and unverifiable).** Sheet section 2 names the new row's effect only on scored run 2; proposal section 9 also discloses a wider lower bound for practice chunk 32 (practice recording only), which the sheet omits. Not verifiable by me: the meeting regression hash `adc8c930...cd76` (needs scoring, barred), the PowerShell parse and npm results "carried from the previous pin", and the scored-run-2 metadata hash and 648 count (needs the scored-run-2 folders, barred).

Stop rule applied: only wrong statements and concrete defects are listed.
