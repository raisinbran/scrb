# QA: ChatGPT follow-up fixes (2026-10-31)

**Reviewed:** `rosmont/meeting-scribe-remaining-20261031` at `b45ed01`, covering the merge `346eb4d` and fixes for tasks 11, 12, 21, 26 and 36. Fixes are on `qa/chatgpt-followup`.

**Result:** as delivered, `npm run check` passed (762 passed, 24 skipped), with 3 unformatted files. After the fixes below, `npm run check` passes (767 passed, 24 skipped), `npm run test:smoke` passes (5 passed, 2 skipped), and changed code passes Prettier. Skipped smoke tests are the real-recording and real-final-pass runs. No native, hardware, installed-app, Windows or long-run test was run.

**Do not merge wholesale.** The gate rule in the 9 to 36 QA report still applies.

The merge kept both the privacy callback and the track write-error handling. It changed no native code against `main`.

## Fixed here

| Task | Problem | Fix | Test |
| --- | --- | --- | --- |
| 26 | The recovery lock also fired when the old index was untouched: a crash during the backup, a full disk, or a bad backup left the library locked with no repair path | The backup is written as `.copying-*` and renamed to `.upgrade-*` only once verified. A failed or crashed copy is removed and the upgrade can retry | Yes |
| 21 | A `transcriptionFailed` meeting counted as busy, so a voice profile linked to it could never be deleted | Only `recording`, `importing` and `finalPassRunning` are busy | Yes |
| 21 | Unlinking a profile marked unchanged summaries as outdated | Unlink no longer counts as a user edit | Yes |
| 21 | `lastHeardAt` could be `null`, which the contract forbids; the Speakers screen would show 1 January 1970 | Falls back to the profile's own date when none of its meetings remain | Yes |
| 12 | Too little disk space gave the "repaired" warning, which offers no action | Own warning: free space and reopen | None: one message, native dialog |
| 21 | Redo history unlinking had no test | Test added | Yes |
| 11, 12, 21 | 3 files unformatted | Formatted | n/a |

Removing each tested fix above made a test fail. So did removing ChatGPT's recovery lock, delete check, undo and redo unlinking, space check, row check, snapshot version check and last-heard date. Redo unlinking had no test as delivered, so one was added.

## Open bugs

- **Index recovery (tasks 12, 26):** after a real migration failure, or if deleting the backup fails after a good upgrade (likely on Windows if antivirus holds the file), the library stays locked with no repair screen. Data is safe. This needs ChatGPT's recommended recovery flow, which should be a plan for the owner.
- **Task 21:** one unreadable `transcript.json` makes `deleteProfile` fail for every profile. The profile stays, and the error is generic.

## Decisions

Accepted as ChatGPT recommended: vocabulary provenance stays open pending a schema proposal, the task 36 report corrections stand, and the auto-name line stays 0.60. Contract proposals still wait for the owner.
