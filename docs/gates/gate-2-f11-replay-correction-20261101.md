# F11 Standby Replay Fixture Correction

Date: 2026-11-01, America/Los_Angeles. Branch: `rosmont/f11-standby-replay-fix-20261101`. Base: latest fetched `origin/main`, `e180a51f5b12cea698766c5c7a764c4c62f09154`. Follow-up to [PR #14](https://github.com/raisinbran/scrb/pull/14), whose historical failure evidence remains unchanged.

## Root Cause

This failure is a **test-fixture problem**. The F11 CSV contains sampled QPC/arrival times and cumulative frame counts, not PCM. `TestRealStandbyLog` invents PCM for each reconstructed packet. Its constant amplitude 1 is below the production T23 near-silence threshold of 16.

T23 intentionally discards late near-silent meeting packets to mark audio lost during a process stall. `IsStaleSilence` runs before divergence correction. Feeding invented amplitude-1 samples into this timing replay causes the filter to discard 1,888,320 of the replay's 16,335,840 frames: 39,340 ms. That added to the expected 1,690 ms timing loss gives the observed 41,030 ms. It does not demonstrate that the original Windows recording lost those extra seconds: the fixture supplies no waveform with which to make that claim.

Reproduced the existing binary's failure with the README command, exit 1 at the original line 417. Then compiled a disposable diagnostic copy of the **base** test source, linked against the unchanged production pipeline. Only the invented sample value varied at runtime; extra reporting counted generated/written frames and correction. Results are preserved in `native/windows-capture/results/f11-diagnostic-20261101.txt`:

| Synthetic amplitude | Written frames / generated frames | Missing time | Exit |
| --- | --- | --- | --- |
| 1 | 14,447,520 / 16,335,840 | 41,030 ms | 1 |
| 16 | 14,447,520 / 16,335,840 | 41,030 ms | 1 |
| 17 | 16,335,840 / 16,335,840 | 1,690 ms | 0 |
| 100 | 16,335,840 / 16,335,840 | 1,690 ms | 0 |

The transition at 16/17 matches `PipelineConfig::stalePeak` and confirms the fixture/detector interaction. No production setting was disabled or changed to obtain these results. The disposable diagnostic's use of `getenv` produced an MSVC C4996 warning; the committed test build has no such diagnostic code or warning.

## Smallest Correction And Safety

Change only the replay's invented fill from 1 to 100, matching the existing synthetic rig's ordinary signal level, and explain why the timing-only fixture needs audible fill. Add one assertion that every reconstructed frame is written, so an unintended drop cannot be hidden by an acceptable aggregate missing-time figure.

The CSV, production capture code, T23 threshold of 16, 500 ms stall and 50 ms drain thresholds, and F11 acceptance checks (`raw > 1500`, absolute loss error under 100 ms) are unchanged. This is a test-only correction; it does not alter recording, pause, privacy, or file behavior.

Existing native tests still cover near-silent stall loss marking (amplitude 3), keeping audible buffered stall audio, keeping quiet on-time audio, and never applying the near-silent drop to the microphone. Those tests ran with the unchanged production filter in the same passing executable. No new hardware or endurance requirement was introduced.

## Commands And Results

Host: Windows 10.0.26300, Dell Precision 7760, VS Build Tools at `C:\BuildTools`. Working directory for commands below: `C:\Users\bchen\Documents\ChatGPT\srcb\repo\native\windows-capture`.

Initial reproduction, before editing source:

```powershell
.\build\bin\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv
```

FAIL: raw offset 1690 ms, detected missing 41030 ms, one failure, exit 1. PR #14 preserves the original full failing stdout; the new diagnostic log independently reproduces the same loss on the base source.

Diagnostic source preparation: copied the base `tests/PipelineTests.cpp` to ignored `out/f11-diagnostic/PipelineTests.cpp`; adjusted relative header paths from `../src/` to `../../src/`, included `<cstdlib>`, replaced the replay's value 1 with `static_cast<int16_t>(std::atoi(std::getenv("SCRB_F11_AMPLITUDE")))`, and printed generated frames, `sink.written`, and `pipe.stats().correctionNs` before the existing offset report. No other logic changed. Commands:

```powershell
cmd /c 'call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && cl /nologo /EHsc /O2 /MD /std:c++17 /W3 /DNOMINMAX out\f11-diagnostic\PipelineTests.cpp src\TrackPipeline.cpp /Foout\f11-diagnostic\ /Fe:out\f11-diagnostic\PipelineTests.exe'
foreach($amplitude in 1,16,17,100) {
    $env:SCRB_F11_AMPLITUDE=[string]$amplitude
    "amplitude=$amplitude"
    & .\out\f11-diagnostic\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv | Select-Object -Last 5
    "exit=$LASTEXITCODE"
}
Remove-Item Env:\SCRB_F11_AMPLITUDE
```

Affected test build, using the same compiler flags as `build.cmd` without rebuilding unaffected helper/decoder targets:

```powershell
cmd /c 'call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && cl /nologo /EHsc /O2 /MD /std:c++17 /W3 /DNOMINMAX /Ithird_party\opus\include /Fobuild\obj\ tests\PipelineTests.cpp src\TrackPipeline.cpp /Fe:build\bin\PipelineTests.exe'
.\build\bin\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv
git diff --check
```

- Build: PASS, exit 0, output in `results/f11-fix-build-20261101.txt`.
- Complete affected native pipeline executable, including F11, T23, gate/pause, sleep/wake, and BUG-2 assertions: PASS, 0 failures, exit 0. Raw/detected loss 1690/1690 ms. Frame-retention assertion passes. Output in `results/f11-fix-pipeline-20261101.txt`.
- Whitespace check: PASS. No endurance, hardware capture, GitHub CI, npm, or unrelated tests repeated.

## Independent QA And Remaining Gate 2 Risk

Independent **ChatGPT Chat QA is required before merging this fix**. QA should review the amplitude-boundary diagnostic, confirm the unchanged production diff and acceptance thresholds, and verify the native test output. The new assertion checks retention of the reconstructed timing fixture, not the waveform of an original standby recording.

No substantive recording or privacy defect was confirmed in this investigation. The specific native-test failure is locally corrected, but its Gate 2 blocker must remain open until independent QA accepts the diagnosis and fix. This does not approve Gate 2, resolve unrelated outstanding checks, or change the owner-approved Windows hibernation and Mac stall exceptions. No merge or approval was performed. The fix is on a separate branch from PR #14; it does not include or replace that PR's T18 recovery evidence.
