# Gate 3 Windows retest: owner approval record (2026-11-10 PT)

This record states approvals only. It authorizes NO recording, NO rehearsal, NO scored run, NO scoring and NO merge, and nothing else beyond the eight items below. The scored run still needs its own written authorization. This file is outside the manifest pin and changes no pinned file.

## What was approved

Manifest: `docs/gates/windows-gate3-v3-preflight-manifest.json`, SHA-256 (LF-normalized, as `verify-against-manifest.py` computes it) `a41e289bd4e5ee8b5a525c6dbb4fca22331a6bce2c9ca663649d1dde52830dc2`.

| Pin | Value |
|---|---|
| Code SHA | `76768d5c44e3f267db9892db1d1aa1b1c99e7431` |
| Documents pin | `8426e1cee61c1172a1b1eafeab881942d05a50e7` |
| Branch head | `d2a45d44f47a4539a47e60f77e0e29be336c4851` (`rosmont/windows-gate3-integration-2-20261109`) |

Owner text, verbatim:

> OWNER APPROVAL RECORD (records approvals only; it authorizes NO recording, NO rehearsal, NO scored run, NO scoring and NO merge). The owner approves the following for the Windows Gate 3 retest, naming the manifest by its SHA-256: a41e289bd4e5ee8b5a525c6dbb4fca22331a6bce2c9ca663649d1dde52830dc2 (code SHA 76768d5c44e3f267db9892db1d1aa1b1c99e7431, docs pin 8426e1cee61c1172a1b1eafeab881942d05a50e7, branch head d2a45d44f47a4539a47e60f77e0e29be336c4851). Items, numbered as in docs/gates/gate-3-windows-owner-approval-sheet-20261109.md:
> 1. v3a amendment sections 4, 4a, 4b: APPROVED
> 2. 30 s reach: APPROVED
> 3. 0.0006 s/s drift allowance (empirical, from the practice recording, never retuned after scored-run results): APPROVED
> 4. Rule 6 capture check: APPROVED
> 5. Rule 8 timing-INCONCLUSIVE treatment: APPROVED
> 6. Capture-equivalence differences accepted, with the stated limit that a clean result describes this cable-and-loopback route at volume 10 and not a real microphone and speakers: APPROVED
> 7. Lead-marker treatment: APPROVED
> 8. Freezing the manifest above (any later change to a pinned file means a new manifest and a new approval): APPROVED
>
> The owner also confirms: no acceptance threshold changes (3 s median, 6 s limit, 95% fraction, failure window, denominator unchanged).

## Verification at recording time (2026-11-10 PT)

- The manifest at `d2a45d4`, LF-normalized, hashes to the approved value.
- `verify-against-manifest.py` run from a clean checkout of the documents pin with the approved hash: 288 entries and checks verified, 0 mismatches, `RESULT: PASS`. The manifest's own status field still reads `NOT_FROZEN`; this record does not edit it.
