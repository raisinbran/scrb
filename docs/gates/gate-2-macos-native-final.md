# Final macOS Gate 2 Native Verification

Date: 2026-11-01. Tested latest fetched `origin/main`: `e180a51f5b12cea698766c5c7a764c4c62f09154`. Review branch: `rosmont/macos-gate2-native-final`. macOS native verification: **PASS**, pending independent QA. No product code changed.

## Newly Executed Checks

Commands ran from the review worktree. Existing `phase0/tools` and `phase0/upstream` were linked from the local checkout. Opus HEAD matched MANIFEST pin `251d657e92fccfa3b05baec4f05756cce252fb75`. Module caches were placed in writable temporary directories.

```sh
CLANG_MODULE_CACHE_PATH=/private/tmp/scrb-gate2-clang SWIFT_MODULECACHE_PATH=/private/tmp/scrb-gate2-swift bash native/macos-capture/build.sh
CLANG_MODULE_CACHE_PATH=/private/tmp/scrb-gate2-clang SWIFT_MODULECACHE_PATH=/private/tmp/scrb-gate2-swift swiftc -parse-as-library native/macos-capture/src/Resample.swift native/macos-capture/scripts/resample_check.swift -o /private/tmp/scrb-final-resample
/private/tmp/scrb-final-resample
bash phase0/scripts/run-muted.sh python3 native/macos-capture/scripts/stop_paused_case.py /Users/brandonchen/Documents/ChatGPT/srcb/macos-native-final/native/macos-capture/build/scrb-capture /private/tmp/scrb-final-native-pause 3
```

- Native build: PASS, exit 0. Helper SHA-256: `f4ddf9c79c041717f9236617f716a9c067abbbf2a5ca322d9d99ebeee0da5a28`. Initial Opus CMake configuration warned that git version metadata was unavailable; build succeeded.
- Resampler compile and regression: PASS, exit 0. All six synthetic rates (22050, 32000, 44100, 88200, 96000, 192000 Hz) returned 2,880,000 frames, approximately 999.983 Hz, and `ok`. This software check is not the deferred USB hardware test.
- Stop during pause: PASS, exit 0, three rounds. Each track saved one chunk per round; all six `past cutoff` lists were empty. Final output `PASS`. The first sandboxed attempt stopped before capture because AppleScript could not mute output; the identical command passed outside the sandbox. The wrapper temporarily muted speakers and restored their prior mute state.

Local execution logs: `/private/tmp/scrb-final-mac-build.log`, `/private/tmp/scrb-final-mac-pause.log`. Generated test audio is outside git. No real meeting recordings were accessed.

## Integrated Fixes and Reused Evidence

- T6 stopped-stream detection is present in `native/macos-capture/src/main.swift` (`streamSilent`/`streamDead`, rebuild/retry). Existing `~/.local/share/scrb-tests/t6b.log` was inspected: real helper detected and recovered microphone, followed meeting, and whole-computer stopped streams; marked gaps 3339, 3307, and 3296 ms. Failed reopen retries and both sound-ending cases are recorded. This is previously executed hardware evidence, not a new T6 run.
- T20 permission-loss handling is present in the same helper (`permissionLost`, blocked zeros, reopen/recovery). Existing `~/.local/share/scrb-tests/t20b.log` confirms permissionLost/permissionRestored for both tracks and marked gaps of 15427 ms microphone and 30336 ms meeting. `git diff aa88eb4 origin/main -- native/macos-capture` is empty, so the native source matches the fixed rerun source. No permissions were changed in this verification.
- T17 helper `serviceRestarted` rebuild and app warning routing for both `serviceRestarted` and `streamDead` are present. App `permissionLost` routing is also present in `apps/desktop/src/main/recording.ts`. The later app changes add Teams source forwarding and meetingSilent handling; they retain these warning branches. Existing T17 evidence in `2026-10-30-macos-long-run.md` is reused. No coreaudiod restart or new app-level T17 run occurred.

Reused log SHA-256 values: T6 `16b74aeefaf0a5bd8720f022f04f27f43d83419718a7304aa99776c23dd0e201`; T20 `3c25a2cdd96073a8c9e97c9430e831a6bb87c072055c50890cbbfe2d57b4beca`. These hashes identify inspected logs, not a new hardware execution or independent certification of their original runs.

## Gate Status

This completes the requested macOS native build and short regression verification, subject to independent QA. Existing owner exceptions for the Mac 5.5-second stall and Windows critical-battery hibernation are preserved. No endurance, T17 service restart, T20 permission, GitHub CI, or USB hardware test was repeated. Mac USB 44.1 kHz remains deferred before Gate 8.

Gate 2 remains open: Windows final native evidence and cross-platform CI/check/smoke conclusions are outside this Mac verification and must be verified separately. Windows followed-Teams picker drift still lacks supporting output in the retained MODULE_NOT_FOUND artifact. Independent QA and owner approval remain required. No merge or Gate approval is authorized by this result.
