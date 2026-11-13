# Plan: change the microphone or meeting app during a recording (plan only, no code)

Status: draft for independent review (ChatGPT review **pending**) and owner approval. **No code before both.** It touches the native capture helper and recorded audio, a risky change under `AGENTS.md`.

## Problem

`apps/desktop/src/main/recording.ts` (`select`) rejects a source change while recording with a `conflict`: "Stop the recording to change the meeting app or microphone." Its comment says the helper cannot switch mid-recording. **That is not true on either platform.** The owner wants the switch, for example moving to a headset mid-meeting, or picking the right app after starting on "Whole computer audio".

## What the helper already does (verified in code)

macOS (`native/macos-capture`):

- `selectMic` and `selectSource` commands exist (`main.swift`, `handle`). They set `mic` / `source` and call the existing single `rebuild` path with reasons `deviceChanged` and `sourceChanged`. `reopen` closes the track's chunk (`Track.close`), closes the stream, opens a new `MicStream` or `MeetingStream`, resets the ring's heard-time, and emits `streamReopened` or `streamDead`.
- Mic switching is therefore already complete: the same path handles unplugging, the default device changing (debounced 5 s, only when `mic == "default"`), wake and a dead stream.
- Meeting switching reuses the same path: `MeetingStream.open(source:)` builds a new process tap and private aggregate device each time, so a different app needs no new machinery. An empty list means a whole-computer tap.
- Timing is safe: the next chunk's start comes from the first packet's host time (`session.toSessionNs(host:)`), never from counted samples, and chunks end at a rebuild (`capture-contract-and-clock.md`: "chunks stop at every problem"). Old-device audio still in the ring is written before the new audio, using each slot's own rate.
- Pause: `rt_capture` drops packets while the gate is closed, so a switch during a pause records nothing and the next resume opens a chunk with reason `resume`. Nothing special is needed.

Windows (`native/windows-capture/src/Session.cpp`): `DoSelectMic` and `DoSelectSource` also exist (the latter is "how the core reattaches a meeting app that restarted"). `DoSelectSource` clears `followApp`, so moving to or from Teams (the output-device app, `OUTPUT_DEVICE_APPS`) cannot use it as it stands.

TypeScript: `packages/capture/src/index.ts` already types both commands. **Nothing in the app calls them**, and `native/macos-capture/tests/` has no test that does.

## What is missing

1. **Wiring.** `recording.ts` never sends the commands and refuses instead. Needs: send the command through the live session, and only then save the selection.
2. **Honest results (helper).** `handle` returns `ok: true` for both commands whatever happened. The caller cannot tell success from a dead new stream.
3. **Rollback (helper).** `selectMic`/`selectSource` assign `mic`/`source` before opening, and `reopen` has already closed the old stream. If the new source fails, the track is dead and the 3 s stall check keeps retrying the **bad** new choice. The old one is lost. The user's rule ("keep the old one and say so") needs this fixed.
4. **Meeting-app specifics.** The new app may have no audio process yet (`"no audio process for the meeting app"`), or the system-audio permission may be missing. The tap is created fresh, so first audio can lag the switch.
5. **Windows `followApp`** (above), and no Windows test of mid-recording selection.
6. **Tests** for all of the above (none exist).

## Design

### Helper (macOS first)

- `selectMic` / `selectSource` become: remember the old value, close the old stream, open the new one. On success keep the new value, ack `ok: true`. On failure re-open the old value, restore it, emit `streamReopened` for the old one and ack `ok: false` with `error` ("kept the previous microphone / app"). If the old one also fails, behave as today (`streamDead`, existing retry) and ack `ok: false` with `activeTracks` showing the loss.
- Same-value request: ack `ok: true`, do nothing (no needless gap).
- Do not open the new stream while the old one runs: two streams feeding one ring would interleave samples.
- Reuse `rebuild`'s reasons (`deviceChanged`, `sourceChanged`) so chunk reasons and `docs/plans/capture-contract-and-clock.md` stay true. No new chunk format, event type or command.
- **Cancel the pending default-device rebuild.** The default-input listener schedules a rebuild 5 s later (`micChange`, `main.swift` `watch`). That work item does not recheck `mic` when it fires, and `selectMic` does not cancel it, so a pick made inside those 5 s is followed by a second rebuild and a second gap. `selectMic` must cancel `micChange` (also on a failed switch's rollback), and the work item must recheck `mic == "default"` when it runs. Picking "System default" keeps the listener working.

### Main process (`recording.ts`, `sources.ts`)

- `select` while recording or paused: compare the request with the saved selection to find which field changed. **One source per request:** if both the mic and the app differ, throw `ContractError('conflict', "Change the microphone and the meeting app one at a time while recording.")`, send nothing and save nothing. This is smaller than a two-step atomic rollback (which would have to undo a successful first switch, with a second gap, and keep `openCommand` and Settings in step). The Live pickers already change one field at a time; only the Settings screen can send both, and it simply asks for two steps. Then resolve with `resolveSources` and **validate only the changed field**; an unchanged field is ignored, so an app that has exited does not block a mic switch and a disconnected mic does not block an app switch. **Reject before sending anything** when the changed mic is gone (`micFellBack`; `resolveSources` would otherwise substitute the system default, and the switch would "succeed" and save the missing ID) or when the changed app has no audio process (`NO_PROCESS`). Throw `ContractError('conflict', "That microphone is not available." / "That app is not playing audio yet.")`, keep the old source, save nothing. A null mic (system default) is always valid. Otherwise send `selectMic` and/or `selectSource` with fresh command IDs, wait for the ack, then `sources.save`. On `ok: false` throw `ContractError('conflict', <plain message>)` and **do not save**, so Settings and the Live pickers stay on the working source.
- While `starting` or a worker restart is in flight, still refuse with the current `conflict` (the session is not ready to switch).
- On success raise a **non-alarming** health note with the existing warning kind `deviceChanged` ("Switched to <name>. About a second of audio may be missing.") at level `ok`. If the track stayed dead, keep the existing `audioMissing` warning from `streamDead`.
- **Worker restart must restore the new source.** `RecordingSession` (`packages/app-core/src/recording.ts`) keeps the original `open` command (`openCommand`, set once in `start`) and every restart re-sends it through `reopenCommand()`, not `sources.read()`. A restart after a switch would silently go back to the old mic or app. Add a method on `RecordingSession` that sends the select command and, only on an `ok` ack, updates `openCommand.mic` / `.source` / `.followApp`, so the next restart opens with the switched choice. `recording.ts` calls that method, not `adapter.send` directly. Save the selection to Settings only after it returns.
- Windows: until its own slice is done, keep the current refusal on Windows (platform check), so macOS behaviour does not widen Windows risk.

### Gap and timing behaviour

- The switch closes one chunk and opens the next. Expect roughly 0.1 to 0.3 s without audio on that track for a mic switch (the helper's own comment says a rebuild takes about 0.1 s); a tap rebuild may take longer. **Measure it; do not assume** (test 3).
- The other track is not touched: no chunk closes, no timing change.
- Chunk start times are host-time stamps, so the transcript timeline keeps the correct offsets across the switch. The gap is simply no audio on that track, shown like a rebuild gap today. There is no pause span, no marker, and the elapsed-time counter keeps running.
- Chunk files stay complete: `endChunk` finishes the file before the new one opens. Test 4 checks no truncated or overlapping chunk and monotone sequence numbers.
- Words spoken during the gap are lost on that track; the user is told (wording below). The final pass and live pass already handle gaps between chunks, as with a wake or device change.
- Pause: allowed. Switching while paused takes effect at the next resume; the helper keeps the gate closed. The UI may show the picker as usable in both states.

### Health, permissions

- Events used, all existing: `streamReopened`, `streamDead`, `deviceChanged`, `permissionLost`/`permissionRestored`, `meetingSilent`. The permission blocker is per track and survives a reopen (`Track.block`); a switch to an app while permission is denied therefore still reads as `permissionLost`, not as a failed switch.
- A new meeting source that is silent for 3 s hits the existing zeros check and `meetingSilent` path. Not changed.

### UI states and wording (UI code in `apps/desktop/src/ui/`)

The pickers on the Live screen already call `selectSources` and already revert their selection and show `error` on a rejection (`LiveScreen.tsx` `selectSources`). Needed UI work is small:

- Pickers stay enabled while recording and paused.
- During the call (a second or two) show the picker as busy; ignore a second change until it resolves.
- Success: the health note above, shown as an information line, not a warning banner. Text: "Switched to <name>. About a second of audio may be missing."
- Failure: the existing error line with the main-process message: "Could not switch to <name>. Still recording with <old name>." The picker reverts.
- The mock backend must behave the same (accept while recording; one fixture that rejects), because the UI spec requires mock and real to match.

### Contract

**No `packages/contracts/` change is needed.** `selectSources(SourceSelection): void` already exists, errors already cross as `ContractError` with plain text, the success note reuses `RecordingWarningKind` `deviceChanged`, and `SourceSelection` (`micDeviceId`, `meetingAppId`) is unchanged. No handoff note is required. If review finds the success message needs its own kind (for example `sourceSwitched`), that is a one-word addition to `RecordingWarningKind` and needs owner approval plus a note in `docs/handoffs/`; the plan does not propose it.

### Failure and rollback summary

| Case | Result |
| --- | --- |
| New mic or app fails to open | Old source re-opened, selection not saved, user told, recording continues |
| Old source also fails to reopen | Track dead with the existing warning and retry; selection not saved |
| App has no audio process yet | Fails as "no audio process"; old app kept (user can pick Whole computer audio) |
| Worker dies mid-switch | Existing restart path; reopens with `openCommand` as last updated, so the old choice (the update happens only after an `ok` ack) |
| Worker restarts after a successful switch | Reopens with the **new** choice (`openCommand` updated) |
| Picked mic disappeared before the switch | Rejected up front, old mic kept, nothing saved |
| Both fields changed in one request | Rejected up front; nothing sent, `openCommand` and Settings untouched |
| Ack lost | Same command ID returns the first ack (`CaptureAck` contract); no double switch |
| Stop during a switch | The switch call is rejected or ignored; Stop wins |

## Tests (invented audio or AMI only; none over 20 minutes)

1. **Helper command tests** in `native/macos-capture/tests/` (extend `capture-smoke.mjs` style): tone through a test source; `selectMic` to a second input; assert ack `ok`, new chunk with reason `deviceChanged`, `streamReopened`; `selectMic` to a nonexistent id: ack `ok: false`, old mic still recording (rollback), `mic` unchanged. Same for `selectSource`. About 2 minutes.
2. **Unit tests in `recording.test.ts`/`sources.test.ts` and `packages/app-core/src/recording.test.ts`** with a fake adapter: success saves and warns; failure does not save and throws; refused while starting; refused on Windows; same value is a no-op; **a missing mic ID or an app with no process is rejected with nothing sent and nothing saved**; **a request changing both fields is rejected with nothing sent or saved; a mic-only change succeeds while the saved app has exited, and an app-only change succeeds while the saved mic is disconnected, and neither touches the unchanged field's stored value;** **after a successful switch a forced worker restart sends `open` with the new mic or source, and after a failed switch with the old one.**
3. **Gap measurement:** record a continuous invented tone, switch mid-way 10 times, and report the gap per switch from chunk start/end times for mic and meeting. Pass rule: gap equals the measured value within one chunk-clock tolerance, with no overlap above 2 ms (the existing Q4 rule). Under 5 minutes.
4. **Chunk integrity:** after those switches, every chunk decodes, sequence numbers have no hole, and total duration of both tracks matches the timeline. 
5. **Debounce:** change the system default input, then within 5 s pick an explicit mic; assert exactly one rebuild (one gap), no `deviceChanged` rebuild at 5 s. Also a default change with no pick still rebuilds once.
6. **Pause interaction:** switch while paused, resume, confirm nothing recorded in the pause and a `resume` chunk follows.
7. **UI tests** on the mock: pickers enabled while recording, busy state, success note, failure revert and message.
8. **Owner check, optional, 10 minutes or less:** start on the speakers, switch to headphones with a reference AMI clip playing, and read the sentence boundary in the transcript. Never the owner's real meetings.

`npm run check` and `npm run test:smoke` stay green. No test is expected over 20 minutes, so no extra approval is needed.

## Risks

- **Real gap of audio** at the switch (the point of the "about a second" wording). Unmeasured until test 3.
- **Default-device listener race:** a headset connecting flips the default while the user also picks a mic. Handled by cancelling and rechecking the pending rebuild (test 5).
- **Stale restart command:** if the `openCommand` update is missed, a worker crash silently reverts the source. Covered by test 2.
- **Tap rebuild latency and failure** (new app not yet producing audio, permission denied) is the main unknown for the meeting side. Hence mic first.
- **Rollback correctness:** reopening the old source after a failed new one is new code in a critical path; it must not leave two open streams or a stale `mic` value.
- **Windows** `followApp`, hands-free (halved rate) mics and its separate pipeline are not covered until its own slice.
- **Live feed** follows the track's `liveGeneration` bump at chunk end (`endChunk`), so the live pass sees a discontinuity the same way as after wake; verify in test 3 with a live consumer attached.

## Echo: this is a stopgap, not a fix

Speaker echo comes from the mic hearing the laptop speakers. Switching to a headset or other mic mid-meeting stops *new* echo from that moment (a headset leaks nothing, and the plan's own "not an issue" list already says so), and the owner can do it without losing the meeting. It does nothing for audio recorded before the switch, nothing for the next meeting if the user forgets, and changing the *meeting app* has no effect on echo at all. The real remedies are unchanged: `dropRoomEcho` in the final pass (PR #143) and the voice-processing spike in PR #160 (`docs/plans/mic-echo-handling.md`, option A). This plan must not be presented to users as echo cancellation, and must not delay that spike.
## Slice order and recommendation

1. **Slice 1, macOS mic switching (recommend starting here).** Helper: honest ack, rollback and the pending-rebuild cancel for `selectMic` (and the shared helper code, so `selectSource` gets the ack and rollback too), helper tests 1, 3, 4, 5, 6. Main: wire `select` for the mic with the up-front rejection of a missing mic, the `RecordingSession` restart-command update, platform gate for Windows, unit tests, success and failure messages. UI: enable the mic picker while recording and paused, mock parity. The helper path is already proven for device changes, so the new risk is only rollback and the ack.
2. **Slice 2, macOS meeting-app switching.** Enable the app picker with the same plumbing, add the "no audio process", permission-denied and Whole computer cases to tests 1 and 2, and measure tap rebuild latency. Separate slice because a new process tap is the part with real unknowns and the owner's biggest use (wrong app) can be worked around by picking Whole computer audio.
3. **Slice 3, Windows** (`DoSelectMic`, `DoSelectSource`, `followApp`), after its own check on a Windows PC. Not needed for the owner's Mac use now.

Doing both macOS pickers in one slice is possible because the code is shared, but splitting keeps each review small and puts the proven path first. One PR per slice; each needs independent review before merge, and nothing merges without the owner.

## Unchanged by this plan

Electron security settings, IPC channel names and allowlists, the chunk format, retention, `packages/contracts/`, and the owner's recordings policy. The helper gets no new command or event.
