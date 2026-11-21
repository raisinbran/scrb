### A-1015 — 2026-11-21 — Cloud — Task-start PT clock not captured before M5 recovery follow-up

- **Attribution:** Confirmed self-induced reporting omission during the current cloud read-only M5 recovery and M1 status follow-up.
- **Failure:** The response and GitHub source audit began without recording an exact local PT receipt/start timestamp. The later task-end clock can be observed, but the original start cannot be reconstructed reliably. The five-hour and weekly allowance meters are not available in this cloud surface.
- **Impact:** The exact task duration and comparable beginning/end allowance readings cannot be reported. This is an accounting deficiency, not evidence that the M5 snapshot is missing or that M1 passed/failed anew.
- **Correction:** Record the start field explicitly as unavailable, with reason, in a fresh 12-column task row; leave no fabricated timestamp or quota. The actual technical findings and the previously reported Mac recovery snapshot basename were published on issues #358 and #340 without sharing confidential source-file contents.
- **Prevention:** At the first connector action, capture PT clock/time metadata when exposed; note inaccessible meter/model effort once and do not borrow an unrelated machine's readings.
- **Remaining risk:** Published-repository cross-check found no A-1015 in current main or existing #396 filenames; unpublished M5/W10 and other cloud reservations are not independently accessible. Verify conflict-free allocation before merge.
