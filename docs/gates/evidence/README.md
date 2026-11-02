# Gate 3 endurance evidence: November 2, 2026

Two four-hour physical tests ran against commit `72c41076eb1e8162da4fdf9b5c6b850d623cd1f8`. Their privacy-safe results are backfilled here from the owner's uploaded ZIPs, rather than rerunning the tests.

| Platform | Retrospective report | Recording | Sustained live transcription |
| --- | --- | --- | --- |
| macOS | [Mac evidence](macos/mac-20261102-four-hour-72c4107.json) | PASS by saved runner measurements; original audio absent from ZIP | FAIL, extended silent stalls |
| Windows | [Windows evidence](windows/windows-20261102-four-hour-72c4107.json) | PASS with marked gaps needing acceptance review; all 5,779 chunks independently hash-checked | FAIL, including only four meeting-track words in hour three |

**Evidence preservation:** The original uploaded Mac ZIP includes results, snapshots, logs and a limited transcript snapshot, but no original recorded audio or final transcript. The Windows ZIP includes both original audio tracks and the live transcript. Neither ZIP nor transcript/audio contents are committed to Git. Match an owner's private archive to its report using the SHA-256 checksum recorded in that report.

**No automatic repeat:** Do **not** rerun either four-hour Gate 3 physical recording to fix missing documentation, collect a different summary, or reproduce a live stall. These runs already establish substantial recording endurance. Continue the already-approved instrumented short Mac retest and focused worker tests. Use saved Windows public-audio recording segments to investigate apparent silent live failures when technically feasible. Once the root cause is confirmed, prefer deterministic regressions, short actual-model reproduction and targeted real-device checks. A new four-hour run would require an exceptional, explicit owner decision supported by a specific acceptance gap that shorter evidence cannot resolve.

**Gate 3:** Not approved. The saved four-hour runs cannot establish sustained live-transcription acceptance; resolving and verifying that failure remains necessary. An owner-approved alternative evidence/exception plan may avoid repeating a full four-hour physical capture, but passing capture endurance alone is not evidence that a fixed live worker can sustain four hours.
