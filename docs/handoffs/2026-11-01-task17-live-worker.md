# Task 17 Live PCM Worker Handoff

Branch: `rosmont/phase3-live-worker-20261101`, based on `origin/main` `7a081ca885ecdb611d83728fea189ea777f2d89b`. Gate 2 is owner-approved/closed; Gate 3 is open. Work is limited to the isolated worker side; no native capture or main/UI connection is claimed.

Implementation commit: `66b1df80e4110b02f5cd697e80f99fd9ff0fd881`, pushed. [Draft PR #17](https://github.com/raisinbran/scrb/pull/17) is open for independent QA. Checkpoint prepared at approximately 4:02 AM PST, before the 7:35 AM deadline.

Implemented: bounded per-track 16 kHz PCM framing and queues; isolated dispatcher with supervisor-owned background model processes; timeouts and at most three restarts; live-only overflow/failure gaps; sequence/generation/timeline validation; pause boundaries; individual timed words using existing Whisper/VAD utilities; scratch/process cleanup with visible cleanup failure. Notifications and model output are also bounded. Models and recording locks are separate. No contracts, recording writer/chunk format, privacy setting or OS permission changes. No real capture, private recordings or model downloads.

PR #8's preliminary sink was reviewed, not merged or edited. Its one-utterance-as-one-word mapping must be replaced during integration with the new per-word output. See [the native connection proposal](../plans/task-17-native-pcm-feed-proposal.md) for exact hook points, wire layout, and safety validation.

## Verification

| Command/check                                                                               | Actual result                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                                             | PASS: typechecks/lint, 828 tests passed, 63 skipped. Boundary script skips `rosmont/` branches by existing policy.                                                                                            |
| Targeted Vitest: `live-pcm`, `live-audio-worker`, `live-audio-cleanup`, `worker`, `parsing` | PASS: 43 tests, including 23 new invented-PCM/process cases.                                                                                                                                                  |
| `npm run build -w @scrb/transcription`                                                      | PASS, including the separate worker entry.                                                                                                                                                                    |
| `npm run format:check`                                                                      | FAIL on existing repository style differences and downloaded Opus `doc/header.html` / `footer.html` fragments. No unrelated formatting fix applied. Targeted Prettier on every changed source/test/doc: PASS. |
| `npm run test:smoke`                                                                        | PASS in desktop context: 5 passed, 2 real-audio tests explicitly skipped. Existing local Electron 45.1.0 runtime reused; no download. Initial sandbox build had filesystem access errors.                     |
| Native compile                                                                              | Not run: no native code changed.                                                                                                                                                                              |

Actual outputs and commands are preserved in [the verification record](2026-11-01-task17-live-worker-results.txt). The real dispatcher test compiles the entry with TypeScript, uses fake VAD/loopback model responses, and verifies separate per-word timestamps and cleanup. No model inference, native feed, hardware capture safety, Gate 3 latency/WER/memory target, or macOS runtime result is claimed.

## Exact Continuation

1. Independently QA the worker-only draft. The repository-wide formatting failure remains a baseline/tooling limitation, not a passing check.
2. Review/approve the proposed native hook, nonblocking transport and 16 kHz resampler changes. They remain proposals under the existing risky-change rule.
3. Implement and native-test both ports after that review; connect the adapter's framed stream to `offer()` with stop/quit cleanup. Package the compiled worker entry (no renderer audio IPC) and verify the packaged Node/Electron launcher.
4. Add the main storage/event bridge with one-to-one timed words, mapping worker `mic` to storage `microphone`, revision/correction protection and independent final pass; do not cherry-pick all of PR #8. Recording Stop must not wait for live cleanup.
5. Run the still-unperformed Gate 3 model/native measurements on both machines and obtain independent QA. Do not merge or close Gate 3 in this unattended session.
