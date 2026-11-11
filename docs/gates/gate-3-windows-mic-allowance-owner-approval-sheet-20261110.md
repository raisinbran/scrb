# Gate 3 Windows: owner approval sheet for the microphone chunk-47 allowance (2026-11-10 PT)

Status: **nothing here is approved.** The approval block at the end is empty. This sheet asks for one decision: whether the new preflight manifest below may be frozen so the microphone track of the existing scored run 2 can be rescored offline.

New manifest SHA-256 (the value you would name if you approve): `b0a00b68148a66a7dab305a7bcf9a3d2f2e9a993ff134818f7c9fcac680c123d`
New pin (code and documents): `78c9acbfd885b678fccd0ea711a8a3be9036776c`, branch `rosmont/windows-gate3-mic-allowance-20261110`.
Previous pin: manifest `a41e289bd4e5ee8b5a525c6dbb4fca22331a6bce2c9ca663649d1dde52830dc2`, code `76768d5c44e3f267db9892db1d1aa1b1c99e7431`.

## 1. What changed

The fix is two sentences. First, one exact-match data row for scored-run-2 microphone chunk 47 (decoded audio is 648 samples, 13.5 ms, longer than its timestamps say: 239,688 against 239,040); the row names that piece by its file fingerprints, so it applies to nothing else. Second, a change so that units inside that chunk include its excess in the lower bound of their acoustic-end estimate, which can raise conservative latency by at most 13.5 ms and never lowers it.

Side effect on the practice recording: its chunk 32 (+168 samples, 3.5 ms, already covered by an older row) also gets the wider lower bound. That is the practice recording only; no scored unit is affected.

What changed in the manifest: 4 entries changed (`audited_decode_spans.json`, `v3a_timing.py`, `test_v3a_conditional.py`, `README.md`) and 1 added (the allowance proposal document); the pin fields; the test-result text (356 tests); and the `git_commit_id` field on 101 entries. Nothing else. The verifier passes with 289 checks and 0 mismatches.

## 2. Why it is safe

- It can only make the conservative latency **worse** by up to 13.5 ms, never better. The best-case latency is unchanged. A word at 5.993 s could become 6.0065 s and would then no longer count as a pass.
- The meeting-track result is unchanged: re-running the meeting track with the new code on a scratch copy gave a result whose hash is identical to the one from the previous pin (hash `adc8c930...cd76`).
- It applies to one hash-bound chunk only. A different file, a different chunk or a different count falls back to the old strict rule.
- Six new tests cover the row, the exact-match requirement, the lower bound and the case where the row is absent. The full suite ran 356 tests, 0 failures (with the two environment variables set it ran 0 skipped; without them 3 tests skip because they need the external practice files).
- The proposal was independently reviewed by ChatGPT (APPROVE, two rounds) before any code was written. Its file header still reads "PROPOSED": it is not owner-approved, and owner approval happens only by signing this sheet. A separate review found one test-file issue that is fixed (register A-077).

## 3. What approving authorizes

Offline rescoring of the **microphone track only**, from the **existing** scored-run-2 recording, under the new pin. No new recording, no new run, no use of the speakers or the app.

## 4. What approving does NOT authorize

- Any threshold change (3 s median, 6 s limit, 95% fraction, failure window, denominator).
- Any waiver of a failed or inconclusive result.
- Any Gate 3 claim. A passing microphone rescore is a result for the independent review, not a gate approval.
- The decisions still open in this sheet's predecessor (`gate-3-windows-owner-approval-sheet-20261109.md`), including D1 and D2, which remain unapproved.

## 5. Residual risks

- **This is a rule change made after the data was seen.** The excess was found in the capture facts, and the row was sized from those facts only (the proposal records which files were read and that no latency or classification result was read). Even so, it was made after run 2 was recorded, so an outside reader may weigh it differently than a rule fixed beforehand. The direction of the change (only more conservative) is the main mitigation.
- **D1 and D2 are still unapproved.** This sheet does not cover them.
- **The recurring capture event about 106 s into the recording is uninvestigated.** The excess in chunk 47 lies near that offset (about 106.149 s). The allowance describes the size of the excess; it does not explain what caused it.
- The independent audit of this pin (AUDIT PASS, audit note `4befed4`) could not verify three things, because that needs the barred scored-run-2 folders or scoring: the meeting-track regression hash, the PowerShell and npm results carried over from the previous pin, and the scored-run-2 sample counts. The author's regression result is reported in the commit message and the usage records.
- During drafting I read the usage table and saw a provisional meeting-track outcome row. This is disclosed in the proposal and logged as A-058.

## 5a. Known harmless stale text

- The manifest's `pins.branch` and its npm boundary-check text still name the old branch.
- The manifest's clean-checkout note says the manifest is not in the pin.
- The proposal's header still says PROPOSED.

None of these affects the check: the verifier binds file hashes and the pinned commit, not these labels. Fixing any of them would change the manifest hash (or a pinned document) and require another audit, so they are left as they are.

## 6. Run procedure note (how the combined verdict will cite both)

- The **meeting-track** result of scored run 2 was scored under the **previous pin**: manifest `a41e289b...830dc2`, code `76768d5`.
- The **microphone rescore** would be under the **new pin**: manifest `b0a00b68...123d`, code `78c9acb`.
- The combined verdict will state both pins side by side, give the manifest hash and code SHA for each track, and cite the identical-meeting-hash regression (section 2) as the link showing the new code did not change the meeting track. Before the rescore, `verify-against-manifest.py` must pass from a clean checkout of `78c9acb` with the approved hash (last run: 289 checks, 0 mismatches). A deliberately wrong hash is rejected (exit 1).

## Owner approval block (EMPTY; nothing below is signed)

I approve freezing the preflight manifest with SHA-256 `b0a00b68148a66a7dab305a7bcf9a3d2f2e9a993ff134818f7c9fcac680c123d` (pin `78c9acbfd885b678fccd0ea711a8a3be9036776c`) for offline rescoring of the scored-run-2 microphone track only, with no threshold change and no Gate 3 claim.

- Approved by: ______________________
- Date and time (PT): ______________________
- Decision (approve / decline): ______________________
- Conditions or notes: ______________________
