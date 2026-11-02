# Gate 3: live transcription gap fix, Mac verification

Date: 2026-11-02. Commit: `5f2d55f`, on `72c4107` plus metadata logging. No native capture change.
Status: short verification passed. This is not Gate 3 approval and does not replace the endurance criterion.

## Defect

A lost live frame made `LivePcmEngine` discard its buffer. Continuous speech then produced no text with
one 100 ms frame lost every 2 s, while acknowledgements stayed current and no error appeared.

## Fix

Losses up to 1 s within a generation keep context. Silence fills only the time the timestamps show as
missing, and the gap is still reported. Boundaries, generation changes and longer losses reset as before.
Live logs now carry per-minute loss, gap, overflow and slowest-hop numbers.

## Synthetic results (one frame lost per N, 60 s of invented audio)

| Lost | Before: text segments | After |
| ---- | --------------------- | ----- |
| None | 15 | PASS |
| 1 in 20 | 0 | PASS |
| 1 in 6 | 0 | PASS |
| 1 in 5 | 0 | PASS |
| 1 in 4 | 0 | PASS |

PASS means at least 10 segments, ordered timestamps within the audio, and no context reset.
Full `npm run check`: 988 tests passed, 25 skipped.

## Mac run

Public AMI ES2004 audio, real helper and live transcription, 09:38 to 09:44 PT. All 10 CPU cores were
loaded from minute 1 to 4.5.

| Measure | Result |
| ------- | ------ |
| Stall of 2 minutes | None |
| Live words | 241, final pass 373 |
| Recording | 65 chunks each track, no gaps, status `ready` |
| Lost frames, minutes 2-5 | Meeting 244, mic 263 |
| Queue overflow | 0 |
| Bridged, reset gaps | 84, 15 |
| Slowest hop | 4.9 s |

## Remaining gaps

- Load caused real frame loss with no queue overflow, so the loss comes before the worker queue. The
  exact source is not established.
- No unfixed-code control ran under the same load, and nothing confirms the overnight stall had this cause.
- Live text is expected to miss audio during heavy load. Losses over 1 s still reset context.
- Windows has not run this change.
