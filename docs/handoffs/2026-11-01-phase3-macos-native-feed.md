# Phase 3 Mac Native PCM Feed

Status: implemented locally; **end-to-end acceptance blocked by a worker timing defect**. Independent Claude Code QA is required before merge. Gate 3 remains open.

Branch: `rosmont/phase3-macos-native-feed-20261101`.
Worktree: `/Users/brandonchen/Documents/ChatGPT/srcb/phase3-macos-native`.
Base: approved proposal `20129b809b8569b00635b8d4549d08b54614805b`, including reviewed worker `6e19c5360ba2050e091f0bb8fe0326b10f21d612` (PRs #20 and #17). Owner explicitly approved this proposal for native implementation. Neither dependency was merged here.

## Implementation

The helper opts in only when `SCRB_LIVE_FD` names a separately inherited descriptor of 3 or greater. Stdout stays JSON. `LiveFeed` configures `F_SETNOSIGPIPE` and `O_NONBLOCK` before writing; a closed reader stops only export. The parent must read this descriptor separately, decode `SLP1` frames, and create a fresh `LiveAudioWorker` after helper restart. This slice does not wire the application to live inference or change any shared interface.

`Track.drain` copies original, accepted mono samples into a separate preallocated ring after durable writing. Each track has 64 entries of at most 2048 input samples. Entries carry the drain-time session stamp, original rate, independent live generation, and an attempted-entry counter. The audio callbacks and durable writer/converter are unchanged. `endChunk` queues an old-generation boundary and advances the live generation on every non-rollover reason, under the existing track mutex.

The exporter owns a separate AVAudioConverter targeting 16 kHz. Normal priming compensates filter delay; impulse checks verify alignment. Output is capped to the input sample duration to exclude padded filter tails. Frames aggregate up to 1600 samples, and timestamps advance by exactly 62500 ns per output sample. Boundaries flush the converter tail and partial frame before closing the generation. Input loss resets conversion, drops pending live samples, leaves a sequence gap, and reanchors from the next drain stamp without moving backwards or compressing the missing interval. Partial pipe writes retain the entire in-progress frame. Capture Stop requests cancellation without joining the exporter; its provisional tails may be discarded.

No Windows, worker, application, UI, durable format, or shared-interface source changed.

## Environment and Build

Physical Mac: arm64, macOS 27.0.1 (26A434), Node v22.23.4. Opus source matches repository pin `251d657e92fccfa3b05baec4f05756cce252fb75`. Existing local `phase0/tools`, `phase0/upstream`, and Node dependencies were reused through uncommitted symlinks.

From the worktree root:

```sh
export CLANG_MODULE_CACHE_PATH=/private/tmp/scrb-gate2-clang
export SWIFT_MODULECACHE_PATH=/private/tmp/scrb-gate2-swift
export PATH="$HOME/.local/share/scrb-node/current/bin:$PATH"
bash native/macos-capture/build.sh
bash native/macos-capture/tests/run.sh
node_modules/.bin/tsc -p packages/transcription/tsconfig.build.json --outDir /private/tmp/scrb-phase3-worker
```

Build: PASS, exit 0. Helper SHA-256: `bd1025f2e4c8e21bc8288cf5d0af466ac531811be250219c0c58601489e43cb5`. Existing Swift unused-result/self warnings remain. Initial CMake configuration warned that upstream version metadata was unavailable; pinned source identity was checked separately.

Native tests: PASS, exit 0. They cover exact 60-second duration and timestamp continuity at 48/44.1 kHz, 2048 input samples at 16 kHz split into bounded wire frames, impulse alignment, overflow/reanchoring, generation changes, slow fragmented writes, EPIPE survival, and bounded exporter cancellation. Production Track/Session definitions are compiled into a test executable without the command-loop entry point. Deterministic packets produce identical durable Ogg codec/audio bytes with live disabled versus a full live ring, excluding run-specific tags, Ogg serial, and CRC. Production drain tests exercise non-rollover reasons, blocked-zero filtering, rollover, and closed-gate rejection. These synthetic checks do not imply a new OS permission/sleep test.

The native test reviewer recommended deleting no tests. A stale-lag race in the initial continuous-worker harness was corrected by requiring a fresh observation after offering the boundary.

## Physical Mac Capture

Invented speech was generated with macOS `say`, played under the existing temporary-mute wrapper, and captured with built-in microphone plus whole-computer audio. No private recording, privacy switch, service restart, or sleep operation was used.

```sh
bash phase0/scripts/run-muted.sh node native/macos-capture/tests/capture-smoke.mjs \
  native/macos-capture/build/scrb-capture /private/tmp/scrb-phase3-worker \
  /private/tmp/scrb-phase3-validation/speech.aiff /private/tmp/scrb-phase3-physical-final
```

PASS, exit 0. Live disabled, normally read, stalled, and reader-closed modes all ended with helper exit 0, both tracks saved, no `.part` left, no write error, and chunks within pause/stop cutoffs. Pause acknowledgement: 1.113, 0.491, 0.468, 0.217 ms. Stop acknowledgement: 126.501, 126.445, 131.657, 157.462 ms. Normal mode decoded 62 wire frames across both tracks with cutoff checks. Real-device runs use different packets and are not claimed byte-identical; deterministic equivalence is established by the native suite above.

```sh
bash phase0/scripts/run-muted.sh node native/macos-capture/tests/restart-helper.mjs \
  native/macos-capture/build/scrb-capture /private/tmp/scrb-phase3-worker \
  /private/tmp/scrb-phase3-validation/speech.aiff /private/tmp/scrb-phase3-restart-final
```

PASS, exit 0 on the initial build; the same check was rerun on the final build. A killed helper was restarted on its original clock with a fresh supervisor: 54 restarted wire frames, zero refused, sequence/generation reset to zero, and two saved chunk checksums unchanged. The real supervisor/dispatcher used an empty-VAD host in this check; it does not prove model accuracy or real-model restart performance. The existing worker restart/timeout/cleanup tests were also run unchanged:

```sh
cd packages/transcription
../../node_modules/.bin/vitest run test/live-audio-worker.test.ts \
  test/live-audio-cleanup.test.ts test/live-pcm.test.ts --config vitest.config.ts
```

PASS outside the sandbox: 30/30 tests, exit 0. The first root-level attempt was blocked by missing unrelated desktop `@vitejs/plugin-react`; the first package-level sandbox attempt failed loopback `listen` with EPERM. The scoped rerun used existing package configuration and changed no dependencies or tests.

## Continuous Audio and Worker Defect

Fixtures are 60 seconds of repeated invented speech, generated at 48 kHz and 44.1 kHz. The native test binary uses the production ring/encoder/converter; the real PCM parser receives fragmented bytes. This checks the native converter-to-real-worker path without requiring a 44.1 kHz USB device. Physical 44.1 kHz input and whole-app Gate 3 performance remain unmeasured.

```sh
node native/macos-capture/tests/continuous-worker.mjs \
  /private/tmp/scrb-phase3-worker native/macos-capture/build/live-feed-tests \
  /private/tmp/scrb-phase3-validation /Users/brandonchen/Documents/GitHub/scrb/phase0
```

48 kHz acceptance: FAIL. The wire contains 601 valid frames: 600 contiguous 1600-sample PCM frames (sequences 0–599, generation 0, exactly 60e9 ns), followed by boundary sequence 600 at 60e9 ns. No trailing bytes. An initial run emitted 169 timed words, refused zero frames, and had no timestamp-gap event, but lost the final 56260–60000 ms interval with `gap.reason = worker`. A later final-converter run did not reach zero lag after the boundary; this is not a clean end-to-end pass. The initial diagnostic incorrectly read the skip reason at the top level; the retained test now checks `event.gap.reason`.

A short direct probe on the retained converted tail isolates an existing worker validation problem: 3740 ms of input yields VAD 0–3740 ms, but Whisper returns a final word at 3740–3760 ms. Feeding this tail through the unchanged `LivePcmEngine` reproduces `Invalid model word timing`. The failure is in `packages/transcription/src/livePcmEngine.ts` word validation, not a native frame timestamp gap. The worker's generic failure path reports a worker skip and restarts; it may leave the last lag notification stale. A separate 8-second real-worker boundary probe completed normally, so no general native boundary failure was demonstrated.

Claude Code handoff: inspect final-tail word timing at PR #17 worker commit `6e19c53`. Do not alter the native sample-count timestamps or silently weaken assertions to hide this failure. Review an appropriate worker-only correction and regression independently; this native branch does not change the worker. The 60-second acceptance checks must pass before this implementation is presented as complete.

44.1 kHz continuous real-worker result: FAIL, exit 1. The wire again contains 601 frames covering exactly 60e9 ns. The worker emitted 163 timed words, refused zero frames, and reported zero timestamp-gap events, but restarted once and reported a worker-side skip at 20000–24000 ms. No final boundary-drain pass is claimed. This run does not independently prove the same underlying cause as the isolated 48 kHz tail; Claude must inspect it separately. The test remains failing rather than suppressing the lost interval.

## Local Evidence and Publication

Logs are outside git at `/private/tmp/scrb-phase3-{build,native-tests,worker-tests,physical-final,restart-final,continuous,continuous-44100,tail-probe}.log`. The short isolated-tail reproducer is `/private/tmp/scrb-phase3-validation/tail-probe.mjs`; its invented input is retained in that scratch folder for Claude QA. Invented audio and model data are not committed.

Workflow tools were made available locally: Worktrunk v0.81.0 verified against published SHA-256, and `pde-gh-write` built from personal-dev-env `2dbf52918c77bb9df3bd96d936a2aa38b83041bb`. Its Linux terminal ioctl constants needed Darwin equivalents; approval logic was unchanged, and `go test ./internal/approval` passed. No agent answered an approval request or bypassed publication controls.

Publication is blocked by the failed end-to-end acceptance test. The requested pull-request workflow says to stop/report when covering tests fail. Keep the local implementation separately reviewable for Claude Code; do not merge, approve Gate 3, or claim the continuous checks passed.
