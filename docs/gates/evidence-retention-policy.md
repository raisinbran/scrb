# Gate test evidence retention — owner decision

**Effective:** 2026-11-02, immediately. **Status:** owner-approved operating rule for Windows, macOS and all SRCB phases. Applies to ongoing runs without interrupting them.

## Default: preserve

**Disable automatic or end-of-run deletion** of recordings and diagnostic evidence from substantive gate tests. This applies whether a test passes, fails, is canceled, or exits with code zero despite a failed acceptance check.

Keep, in private storage outside Git:

- Both original recorded audio tracks, their complete chunk manifests, and recovery/gap metadata.
- The original live transcript (including pauses/stalls), final-pass transcript, model and worker metadata, and source/reference fixture or a reproducible reference to public fixtures.
- Logs, time-series measurements, run configuration, test version/commit, timestamps, and summaries needed to investigate or independently verify the outcome.
- Failed or interrupted run evidence, including enough to reproduce and audit a defect before any retry.

For each run, record the evidence directory in the handoff. Use a stable, uniquely named, non-temporary location. **Do not** configure a test harness to erase its library or recordings in `finally`, teardown, after success, or after failure. A process exit is not permission to delete evidence. Existing active runs should be allowed to finish, but their teardown must be checked **before it executes** and changed or disabled so the recording survives. If safely changing a running harness is impossible, preserve a complete, verified copy before its teardown; never assume logs alone replace audio.

## When deletion may be considered

- **Before the applicable gate has completely passed:** no cleanup of that gate's recorded evidence. A short or failed test, green CI or exit code zero does not grant deletion.
- **After the owner has explicitly approved that gate:** only then may the owner authorize selective, verified cleanup of its evidence. Retain anything needed for unresolved defects, later gates, or final evaluation.
- **At final app completion:** separately review remaining development evidence and clean it up **only with explicit owner authorization**. Gate passage and app completion do not trigger automatic deletion.

These rules address **development/evaluation evidence**, not normal end-user delete functions. Testing deliberate deletion, cancellation and recovery behavior may still clean **disposable test fixtures** and the application's designated failed-import staging area, but preserve separate evidence of the observed behavior. Do not leave ghost meetings merely to satisfy evidence retention. Small ephemeral unit-test sandboxes that contain no substantive gate evidence may still be removed.

## Storage and privacy

Use private local folders, not the repository; do not commit real or confidential meeting audio, transcript text, voices or secrets. Protect evidence against accidental sharing. If capacity is low, warn the owner, pause or gracefully stop the test if needed, or move **verified copies** to owner-approved external storage. Do not delete the only evidence copy to recover space. Record any movement, hashes and missing artifacts. Never silently substitute partial recordings for complete ones.

## Immediate Gate 3 reason

On 2026-11-02 the macOS four-hour integrated test reported a live-transcription stall at approximately minute 47, yet the harness exited successfully and removed its recording and final transcript. This blocked audio-based investigation and contributed to repeated long-test work. Preserve all evidence from the current instrumented retest and future Windows/macOS gate runs. Add a live-progress stall assertion before treating a run as a pass; an exit code alone is insufficient.

**Application code:** no deletion/retention implementation or end-user setting is modified by this document. Each active test agent must apply this rule to its local runner now, including local/untracked scripts absent from Git.
