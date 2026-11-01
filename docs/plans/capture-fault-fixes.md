# Two capture faults from the Gate 2 Mac runs

**Status:** QA applied (`phase0/gpt-QA-reports/20261031_capture-fault-fixes_QA.md`). Approved by the owner on 2026-10-31.
**Evidence:** `docs/handoffs/2026-10-30-macos-long-run.md`.
**Scope:** `packages/app-core/src/recording.ts`, `packages/capture/src/index.ts`, `apps/desktop/src/main/recording.ts`, `native/macos-capture/src/`. No change to `packages/contracts/`, IPC or the chunk file format.

## Fault 1: a brief fault ends the recording

With `writer.lock` held for 3 s, all three restarts were refused within 90 ms and the recording ended.

**Change:** the first restart stays immediate. After a refused or failed restart, wait 1 s before the second try and 2.5 s before the third, so tries fall at about 0, 1 and 3.5 s. The limit stays at three restarts per recording.

**Pass mark:** the gap from last saved audio to first restored audio, measured per track, stays within the 5 s Gate 2 limit. A restart adds about 1.2 s to the wait, so a third-try success should be about 4.7 s. If the real run exceeds 5 s, I shorten the waits or bring the exception to the owner.

| Failure                                              | Handling                                                                                       | Test                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Stop arrives during a wait, with no worker to reply. | Stop ends the wait and finishes at once. No further worker starts.                             | Unit                                            |
| Pause arrives during a wait.                         | Nothing is capturing, so Pause succeeds at once and the next worker stays closed until Resume. | Unit                                            |
| Resume arrives during a wait.                        | Refused with `conflict`, and the meeting stays Paused.                                         | Unit                                            |
| A try succeeds after a wait.                         | Original clock origin kept, gap marked as for any restart.                                     | `three_kill_case.mjs lock`, real helper         |
| Every try fails.                                     | One `workerFailed`, saved audio intact.                                                        | Unit, then the same run with the lock held 10 s |

## Fault 2: audio at an unsupported rate, or a failed write, is lost while the app shows Recording

`Chunks.swift` accepts only 8, 12, 16, 24 and 48 kHz. Other rates are dropped with a `writeError` that nothing reads, on either track. Disk write results are ignored too. Windows requests conversion to 48 kHz (`AUTOCONVERTPCM`), so from reading the code it does not have the rate fault; that is untested.

**Helper**

- A track at an unsupported rate converts to 48 kHz with Apple's `AudioConverter`, on the writer thread. Supported rates are saved as they are today (decision M2 in `macos-capture-adapter.md`).
- A new chunk starts when the **device** rate changes, and that also flushes the converter, because 48 kHz and converted 44.1 kHz look the same once saved. Chunk length and encoding use the saved rate. Gap detection uses device timestamps.
- Chunk start times still come from device timestamps, so conversion delay cannot build up. The converter runs across rollovers and is flushed only when a chunk closes for any other reason.
- When a track starts converting, the helper emits an event naming the track and device rate, so a test can prove which path ran.
- Short or failed page writes, and failed sync, rename or `chunks.log` writes on close, count as write failures. A chunk that failed to finish is not logged as saved, and the `.part` stays for recovery.
- Any failure sends one `writeError` naming the track and cause, then stays quiet until that track writes successfully again.

**App:** the controller's existing `onEvent` listener handles `writeError` beside the level meter, so `RecordingSession` does not change for this. `track` becomes optional on the event in `packages/capture`, because Windows has a session-log error with no track. The app shows one `audioMissing` warning at level `failed` per track, or one with no track for a session-wide error, and the recording keeps running.

| Failure                                                      | Test                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Conversion changes speed or loses audio at rollovers         | 44.1 and 96 kHz tone at a known pitch and length, across at least 10 rollovers |
| Device rate changes mid-recording                            | Real run, 48 to 44.1 to 48 kHz: a new chunk each way, right length             |
| Pause leaves audio in the converter                          | `pause_case.py` at 44.1 kHz                                                    |
| Converter fails to start, a write is short, or closing fails | Forced failures in a helper test: one `writeError`, nothing logged as saved    |
| App warning repeats or the level meter breaks                | Unit tests in `apps/desktop/src/main/recording.test.ts`                        |

## Real-device runs

All muted, with settings restored afterwards:

1. MacBook mic at 44.1 kHz, 60 s AMI clip through the real helper, words out of the final pass. If the mic cannot run at 44.1 kHz, the Steam virtual mic covers the checks that need no real speech, and the USB mic on 2026-11-02 is the real check.
2. Built-in output at 44.1 kHz with a tone, because the tap clocks from it. If the helper's event does not show 44.1 kHz, the meeting path is recorded as not exercised.

`npm run check` must pass, and results go in the long-run note.

## Not in this change

- The 1 GB warning and 100 MB clean stop from `crash-safe-chunks.md` are not built yet on either side of the helper boundary, and this does not add them.
- A fourth crash in one recording still ends it.
