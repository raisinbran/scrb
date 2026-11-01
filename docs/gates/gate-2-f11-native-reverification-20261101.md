# F11 Fresh Windows Native Verification

Date: 2026-11-01 (America/Los_Angeles). Result: **PASS for the scoped build and native tests**. No Gate 2 approval or merge.

## Revision And Review Scope

Corrected branch: `origin/rosmont/f11-standby-replay-fix-20261101`, [PR #15](https://github.com/raisinbran/scrb/pull/15). Exact tested commit: `99ce28076638d6fb1456d5146bc35b232c14d704`. Fresh `git fetch origin` confirmed that revision. Evidence branch: `rosmont/f11-native-reverification-20261101`, based directly on that commit.

The correction available in the remote refs is the one authored earlier in this Codex chat, not a separately identified Claude Code revision. This session freshly rebuilt and executed it; it does **not** constitute independent author QA. Independent ChatGPT Chat QA remains required before merging the fix. No other correction was substituted or claimed as verified.

Diff review against base `origin/main` (`e180a51f5b12cea698766c5c7a764c4c62f09154`) confirms no changes to production `native/windows-capture/src/` or `build.cmd`. The test uses amplitude 100 instead of 1 for invented PCM in the timing-only CSV replay and adds a frame-retention assertion. Existing F11 loss tolerance and production T23 thresholds remain unchanged. No fixes or acceptance-threshold changes were made in this verification.

## Fresh Commands And Evidence

Windows host: Dell Precision 7760, Windows 10.0.26300, VS Build Tools at `C:\BuildTools`. Existing Opus dependency was reused after `git -C native/windows-capture/third_party/opus rev-parse HEAD` verified the README-pinned `251d657e92fccfa3b05baec4f05756cce252fb75`.

Working directory: `C:\Users\bchen\Documents\ChatGPT\srcb\repo\native\windows-capture`.

```powershell
cmd /c build.cmd
.\build\bin\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv
```

Actual stdout/stderr was captured with `2>&1 | Tee-Object`; each exit code was saved immediately from `$LASTEXITCODE`, appended as `exit=...`, and returned by its command shell.

| Check | Newly executed result | Evidence under `native/windows-capture/results/` |
| --- | --- | --- |
| Full README native build | PASS, exit 0; rebuilt `PipelineTests.exe`, `scrb-capture.exe`, and `ChunkVerify.exe` | `f11-qa-native-build-20261101.txt` |
| Previously failing F11 command | PASS, exit 0, zero failures; raw expected loss 1690 ms, detected missing 1690 ms, printed difference 0 ms | `f11-qa-pipeline-20261101.txt` |
| Replay frame retention | PASS: added assertion requires all 16,335,840 reconstructed frames to be written; the executable reports no assertion failure | Same pipeline output |
| Directly relevant existing regression assertions | PASS: T23 near-silent drain loss marking, audible buffered-stall retention, quiet on-time audio retention, microphone exclusion; existing T3/T11 sleep/wake assertions also pass | Same pipeline output |

The mandatory pipeline command runs its existing synthetic cases together; no additional hardware or unrelated test suite was run. The T23 test checks a marked 13-second stall within its existing 60 ms tolerance; its precise measured gap is not printed, so this note does not invent a more precise measurement.

Fixture: unchanged `phase0/artifacts/capture/devices/sleep-wake-timing.csv`, SHA256 `A90523EC18AFC66A76AFB7A9D5F50D8406106BA2E0782BF299A25DAE13E16E7E`, matching the original failing run. Fresh binary and fixture hashes are saved in `f11-qa-hashes-20261101.txt`.

## Remaining Defects And Limits

No remaining failure was observed in this scoped build/test run. The previous 41030 ms result is not reproduced with the corrected fixture. The evidence supports the test-fixture correction; the CSV has no original PCM and does not independently prove the waveform of a standby recording.

No 4-hour run, Teams call, T18 measurement, or other hardware test was repeated. No production code, thresholds, owner-approved exception, or Gate 2 checklist completion state was changed. The outstanding independent QA requirement remains; this fresh execution must not be represented as independent author approval or overall Gate 2 approval. Continue with separate ChatGPT Chat review of PR #15 and this evidence before any merge.
