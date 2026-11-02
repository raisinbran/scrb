# Gate 3 endurance evidence: November 2, 2026

Two four-hour physical tests ran against commit `72c41076eb1e8162da4fdf9b5c6b850d623cd1f8`. Their privacy-safe results are backfilled here from the owner's uploaded ZIPs, rather than rerunning the tests.

| Platform | Retrospective report | Recording | Sustained live transcription |
| --- | --- | --- | --- |
| macOS | [Mac evidence](macos/mac-20261102-four-hour-72c4107.json) | PASS by saved runner measurements; original audio absent from ZIP | FAIL, extended silent stalls |
| Windows | [Windows evidence](windows/windows-20261102-four-hour-72c4107.json) | PASS with marked gaps needing acceptance review; all 5,779 chunks independently hash-checked | FAIL, including only four meeting-track words in hour three |

## Mac live-stall diagnostic (66 minutes)

The [instrumented Mac retest](macos/mac-20261102-live-stall-diagnostic-1h.json) ran on November 2 against commit `694b9b2` (based on `72c4107`). Its 66-minute live pass did **not** reproduce a ten-minute stall. Both recorded audio tracks and the final transcript are retained in the owner's ZIP, along with 66 minute-level live progress samples and the unpushed instrumented commit bundle. The live transcript itself was preserved only through minute 31 because the separate watcher ended with its agent session; the final pass overwrote the remainder. This is an evidence gap, not proof that the previous stall is fixed.

Minute 46–48 logs reveal low live PCM sample counts on **both** tracks, reduced speech detection/model calls, and a live-word-position jump near the 46.8-minute location of the earlier Mac stall; saved-audio manifests still have no gaps. The cause remains unconfirmed. Future tests must preserve the live transcript **inside the test process before final pass**, not through an agent-session watcher.

**Evidence preservation:** The original uploaded Mac ZIP includes results, snapshots, logs and a limited transcript snapshot, but no original recorded audio or final transcript. The Windows ZIP includes both original audio tracks and the live transcript. Neither ZIP nor transcript/audio contents are committed to Git. Match an owner's private archive to its report using the SHA-256 checksum recorded in that report.

**No automatic repeat:** Do **not** rerun either four-hour Gate 3 physical recording to fix missing documentation, collect a different summary, or reproduce a live stall. These runs already establish substantial recording endurance. The approved 66-minute Mac retest has now completed. Continue focused worker/PCM diagnostic tests. Use saved Windows public-audio recording segments to investigate apparent silent live failures when technically feasible. Once the root cause is confirmed, prefer deterministic regressions, short actual-model reproduction and targeted real-device checks. A new four-hour run would require an exceptional, explicit owner decision supported by a specific acceptance gap that shorter evidence cannot resolve.

**Gate 3:** Not approved. The saved four-hour runs cannot establish sustained live-transcription acceptance; resolving and verifying that failure remains necessary. An owner-approved alternative evidence/exception plan may avoid repeating a full four-hour physical capture, but passing capture endurance alone is not evidence that a fixed live worker can sustain four hours.
