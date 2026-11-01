# Windows Gate 2 Final Native Verification

Date: 2026-11-01 (America/Los_Angeles). Review branch: `rosmont/windows-gate2-t18-recovery-20261101`.
Code under test: `origin/main` at `e180a51f5b12cea698766c5c7a764c4c62f09154`, cloned from `https://github.com/raisinbran/scrb.git` for this run. No source changes. Independent QA and owner approval are still required; Gate 2 is not approved.

## Current Results

| Area | Result | Evidence |
| --- | --- | --- |
| Native build | PASS | `native/windows-capture/results/gate2-final-build-20261101.txt` |
| Native tests | FAIL | Logged standby replay detects 41,030 ms missing against 1,690 ms expected; `gate2-final-pipeline-20261101.txt`. Measurement script tests: 10/10 pass. |
| Hardware checks | PASS (scoped short regressions) | Desktop pause, BUG-1 follow/warning/device hooks, followed restart, crash recovery, two-track restart, and BUG-2 bad-mic start/sealing pass. No new live Teams call or real output-device unplug. |
| T18 picker evidence recovery | PASS | Original recording remeasured with unchanged `call_offset.mjs`: 40/45 usable windows, 82 to 81 ms, drift -1 ms, largest step -18 ms. `t18-picker-recovered-20261101.txt`. |

## Commands And Environment

Checkout: `C:\Users\bchen\Documents\ChatGPT\srcb\repo`. Unless stated otherwise, commands below run from `native/windows-capture`. Output is saved in `results/` using the corresponding filenames above and below. Hardware commands run in the signed-in desktop context, after a sandbox attempt demonstrated that the mic did not open there. Node: v26.13.0. Git: 2.56.0.windows.3. Host: Dell Precision 7760, Windows NT 10.0.26300.0, Realtek speakers and microphone array. OS/model CIM queries in the sandbox were denied; the desktop query established the model and OS version.

```powershell
pwsh -File scripts\fetch-opus.ps1
cmd /c build.cmd
.\build\bin\PipelineTests.exe ..\..\phase0\artifacts\capture\devices\sleep-wake-timing.csv
node --test scripts\shared_sound.test.mjs scripts\call_offset.test.mjs
$env:SCRB_TONE=(Resolve-Path ..\..\phase0\probes\windows-tone-player\TonePlayer.exe).Path
node scripts\pause_case.mjs out\gate2-final-pause-20261101
node scripts\pause_case.mjs out\gate2-final-pause-desktop-20261101
node scripts\follow_case.mjs out\gate2-final-follow-20261101 out\gate2-tools\CommTone.exe
node scripts\follow_restart_case.mjs out\gate2-final-follow-restart-20261101 out\gate2-tools\CommTone.exe
node scripts\crash_case.mjs out\gate2-final-crash-20261101
node --experimental-strip-types scripts\restart_case.mjs out\gate2-final-restart-20261101
& scripts\run-case.ps1 -Case gate2-final-bug2-20261101 -Seconds 12 -Mic bogus-device-id
```

All desktop hardware commands above exited 0. Native pipeline command returned a failure; the shell batch also ran the measurement tests afterward, so the batch's final exit 0 belongs to the measurement tests and does not override the pipeline failure. Binary and replay-fixture SHA256 hashes are in `results/gate2-final-binary-hashes-20261101.txt`.

### Short Hardware Results

| Check | Newly executed result | Output under `native/windows-capture/results/` |
| --- | --- | --- |
| Pause, idempotency, marker exclusion | PASS: both tracks open; 2.1 ms pause ack; 880 Hz 4490.4 before/after, marker 2.2; marker present in the live stream while paused | `gate2-final-pause-desktop-20261101.txt` |
| BUG-1 warning/follow | PASS: per-app call-type stream silent, warning logged at 31.524 s; normal stream sound 38/39 s with no warning; followed call-type sound 40/40 s with no warning; brief device hook no move, departed-device hook one move/reopen and sound 24/24 s | `gate2-final-follow-20261101.txt` |
| Follow through pause and worker death | PASS: first worker sound 13 s, second 8 s; reopen/start succeed; same clock and followed source retained | `gate2-final-follow-restart-20261101.txt` |
| Crash recovery | PASS: live lock held, freed after kill; `.part` recovered; 323 ms loss of 7340 ms; recovered tone level 4382.7 | `gate2-final-crash-20261101.txt` |
| Two-track restart | PASS: original clock and numbering, tone from all three workers (4462.7, 4487, 4495.5); one marked gap per track, about 3.14–3.15 s; restart during a pause remains closed until Resume | `gate2-final-restart-20261101.txt` |
| BUG-2 bad-mic start | PASS: fallback; first mic chunk starts 4.8991528 s with `missingBeforeMs: 4899.153`, cause `device`; verifier reports valid chunks and marked loss; meeting has tone in all three chunks | `gate2-final-bug2-20261101.txt`, `gate2-final-bug2-command-20261101.txt` |
| BUG-2 sealing | PASS: exactly one microphone `audioMissing` gap from 0 to 4899152800 ns | `gate2-final-bug2-sealed-20261101.txt` |

BUG-2 sealing used the existing `sealAudio`, with this additional read/assert command (no application code changed):

```powershell
node --input-type=module -e 'import {readFileSync} from "node:fs"; import {sealAudio} from "../../packages/app-core/src/recovery.ts"; const dir="out/gate2-final-bug2-20261101/audio"; const first=JSON.parse(readFileSync(dir+"/microphone/chunks.log","utf8").trim().split("\n")[0]); console.log("first mic chunk",JSON.stringify(first)); const result=await sealAudio(dir,async()=>false); console.log("outcome",result.outcome,"gaps",JSON.stringify(result.gaps)); const gaps=result.gaps.filter(g=>g.track==="microphone"&&g.kind==="audioMissing"&&g.startNs===0); const pass=first.missingBeforeMs>100&&first.missingCause==="device"&&gaps.length===1&&gaps[0].endNs===first.startNs; console.log(pass?"PASS":"FAIL"); process.exitCode=pass?0:1;'
```

The existing follow scripts leave the output muted. Final observed state is Realtek speakers muted, volume 6%; no volume level was intentionally changed. Local raw test recordings are under `native/windows-capture/out/gate2-final-*`, excluded from git.

Initial clone and dependency fetch could not connect from the network sandbox. Retried outside it. The dependency retry encountered Git dubious ownership because the sandbox had initialized `third_party/opus`; resolved for that command only with `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=safe.directory`, and `GIT_CONFIG_VALUE_0=C:/Users/bchen/Documents/ChatGPT/srcb/repo/native/windows-capture/third_party/opus`. No global Git configuration changed. The pinned Opus commit `251d657e92fccfa3b05baec4f05756cce252fb75` built successfully. Build warnings included unavailable shallow-checkout package version, unused CMake policy variables, and ignored `-msse4.1` options; helper build exited 0.

For scripts importing the existing TypeScript recovery code, repository-root `npm.cmd ci --ignore-scripts --offline --no-audit --no-fund` initially failed on cache permissions in the sandbox, then succeeded outside it (282 packages). This was dependency setup only. No GitHub CI checks, `npm run check`, or `npm run test:smoke` were repeated.

Existing local probe executables were copied into this checkout, without committing binaries. SHA256:

- `phase0/probes/windows-mute/Mute.exe`: `0271DCE831B8AB62C65A1321929B641C02C243C9D7DF408509256CE9F7C7F379`
- `phase0/probes/windows-tone-player/TonePlayer.exe`: `F87A6ADD5EB6B79A02B9388D05A8A557FD2F8C694FBE2E6803A8140FD25F4397`
- `native/windows-capture/out/gate2-tools/CommTone.exe`: `C1F867905E89066CD583C1DD8368332B6F5D9B9130F2B381FAB82A03CEB8D962`

The first two came from `C:\Users\bchen\Documents\GitHub\scrb\phase0\probes`; CommTone came from the original test scratchpad's `commtone` directory. `SCRB_TONE` points to the new checkout path to avoid the README's saved per-path mute setting.

## T18 Recovery

The original failed invocation in `results/t18-picker.txt` is retained, with a recovery appendix: its attempted measurement failed with `MODULE_NOT_FOUND` for a missing scratch worktree script path. That invocation does not prove the README's drift claim.

The original test library was found at:

```text
C:\Users\bchen\AppData\Local\Temp\claude\C--Users-bchen-Documents-GitHub-scrb\3d3de3ba-82a1-48a1-a68c-10e49bb412cd\scratchpad\applib\meetings\2026-11-01 Meeting
```

Its `meeting.json` identifies session `a7a7b6db-56b6-49e9-90c7-174e276bf2af`, start `2026-11-01T07:57:43.726Z`, duration 1361243 ms, and no audio deletion. Its session log opens with `followApp: ms-teams.exe`. These match the existing T18 note's time, 1361.2 s length, and followed source. This is the requested invented-conversation test recording, not an unrelated owner meeting.

Executed from this checkout with the newly built decoder:

```powershell
node scripts\call_offset.mjs 'C:\Users\bchen\AppData\Local\Temp\claude\C--Users-bchen-Documents-GitHub-scrb\3d3de3ba-82a1-48a1-a68c-10e49bb412cd\scratchpad\applib\meetings\2026-11-01 Meeting'
```

Exit 0; full output preserved as `results/t18-picker-recovered-20261101.txt`. No new call was made. The script deletes temporary decoded PCM. Recording files remain local and are not committed. Recovery verifies the old recording's measurement; it is not a newly executed live Teams picker test on the final code. The 97–98 ms windows around 150–210 s and largest step -18 ms remain visible in the recovered output; their cause was not investigated.

Metadata and sealed-index SHA256 hashes are saved in `results/t18-picker-recovered-provenance-20261101.txt`. The measurement script reads the sealed indexes and decodes the chunks through `ChunkVerify --pcm`, which checks Ogg CRC and end-of-stream before returning success. A separate `build\bin\ChunkVerify.exe <original-recording-dir>` invocation exited 0 but reported **zero indexed chunks** (274 mic and 276 meeting files present), because its directory mode reads `chunks.log`, not the sealed `chunks.json`. Its `VERIFY OK` is not independent integrity or gap evidence for this sealed recording; the limitation is preserved in `t18-picker-recovered-verify-20261101.txt`.

## Failure Handoff To Claude Code

The existing README-prescribed pipeline command exits 1 at `tests/PipelineTests.cpp:417`: `std::abs(lost - raw) < 100`. Expected raw loss 1690 ms; detected missing 41030 ms. Other assertions report no failures. Preserve the failure; do not weaken the threshold or call this a pass. The replay creates packets with sample amplitude 1, while the integrated T23 stale-silence detector considers samples up to 16 near-silent. This is a possible fixture/detector interaction, not a verified diagnosis or a demonstrated real recording defect. Claude Code should determine whether the fixture or production behavior is wrong and arrange independent QA for any fix.

The sandbox pause attempt exits 1 parsing an empty microphone chunk log; open ack lists only meeting. The desktop rerun opens both tracks and passes, with 2.1 ms pause ack, 880 Hz level 4490.4 before/after and blocked marker level 2.2. This does not establish a production microphone defect.

## Scope And Continuation

No endurance run, real T18 call, audio-service restart, or GitHub CI check was repeated. Previously accepted endurance and T17 evidence is not newly executed evidence. Preserve the owner's Windows hibernation and Mac 5.5-second stall exceptions. Mac USB mic 44.1 kHz testing remains deferred until before Gate 8. Real second-output-device unplug, Zoom, and browser tests were not added to Gate 2.

Final `git fetch origin main` confirms `origin/main` remains `e180a51f5b12cea698766c5c7a764c4c62f09154`. All scoped short checks are complete. Current blocker: native replay failure requires Claude Code assessment. This document is the escalation handoff; no Claude Code session was launched. Exact continuation: reproduce the pipeline command above on this commit, determine whether its synthetic quiet packets invalidate the replay or reveal a production defect, propose the smallest justified correction on a review branch, and obtain independent QA. Do not change the acceptance threshold merely to obtain a pass.

The documentation and newly preserved output are submitted on the named review branch for independent QA. Gate 2 is **not ready for final owner approval** while this native-test failure remains unresolved. No source fixes, merge, or approval occurred. The existing aggregate final-check checklist item stays unchecked. Latest allowance observation: 81% five-hour and 40% weekly remaining.
