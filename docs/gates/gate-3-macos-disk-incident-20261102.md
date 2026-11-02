# Gate 3 macOS endurance: unrelated disk-growth incident

**Date:** 2026-11-02 (Pacific time)  
**Candidate:** PR #42 at `72c4107`  
**Disposition:** External test-environment incident; **not** a demonstrated SRCB defect or a Gate 3 result.

During the Mac four-hour integrated recording and live-transcription test, free space fell to about **41 GiB**. The cause was an orphaned `cat` process (PID **88834**), created by an earlier background agent-shell task under the `gate3-playback` worktree. It read from its own output file, `bqtoqzrlq.output`, while appending to that same file in a loop. That unrelated file reached approximately **162.7 GB (151 GiB)**. Measured growth was about **1.4 GB/min** at one point and about **2.3 GB/min** on average; the owner's initial estimate of 5 GB/min was not independently confirmed.

The agent verified the process command and orphaned state, then sent `SIGTERM` to that PID without stopping SRCB, deleting recording data or changing product code. After checking that the junk file was no longer open, the agent removed **only that file**. Reported available space rose from **41 GiB to 193 GiB**, and rapid growth stopped.

**Recording status at the 20-minute observation:** capture helper, Electron, scripts and live transcription remained running; app data grew about **0.5 MB/min**, UI response was approximately **3 ms**, transcription lag approximately **1 second**, and memory usage was steady. A once-per-minute disk-space watch remained active, with an alert below **35 GiB**; it **could not automatically stop** the recording. The four-hour run's **final outcome and acceptance measurements were still pending** when this incident was reported.

**Lesson:** When disk use accelerates during agent-driven tests, identify the growing file and its process before blaming or stopping the product test. Inspect process arguments and open file handles; do not delete active recording data. Avoid any shell command that reads a file while redirecting output back into that same file. Preserve raw test evidence outside Git.
