# Plan: Windows capture adapter

Status: **Draft for owner approval. Not approved. No code may be written from it yet.**

Date: 2026-10-30. Base commit: `4abe340`. Depends on `capture-contract-and-clock.md`, whose rules (D1 to D10), tests (T1 to T24) and decisions (C1 to C10) are used here.

Sources: Gate 0 evidence, `phase0/HANDOFF-WINDOWS.md`, and the `windows-capture` branch (tip `cac61df`, cut from `3fc9931`).

## In short

This plan builds the Windows side of recording: per-app meeting audio plus your mic, surviving every failure Phase 0 found.

**Code for this already exists, unapproved.** The `windows-capture` branch holds about 2,900 lines: a helper program, chunk writing, a checker and test results. It was written before any plan, and its own README says a plan is required. Nothing from it is merged. This plan treats it as a starting point to review, not as approved work (decision W1).

## Where the branch stands

Its README reports these on one PC, with every run checked by its verifier:

| Passed on the branch | Not yet proved |
| --- | --- |
| Pipeline tests for T2, T3, T3b, T4, T6, T11, T13, T14 | Mic following the default (`input-switch`) |
| Replay of the logged standby run | Bluetooth disconnect on real hardware |
| Pause, 30 s baseline | Bluetooth hands-free switch |
| Forced 4 s stall (see finding below) | Real sleep/wake |
| Silent stream death by fault hook, reopened | Mic privacy off and on |
| Force-kill leaves valid closed chunks | Windows Audio service restart |
| Target app exit, whole-computer capture, source and mic switches | Debounce, Bluetooth detection, picked-mic fallback, real Teams/Zoom/browser, CPU under load, 8 h, USB unplug |

Each "not proved" item is a failure Gate 2 depends on. The passes do not reach them.

## What changes

1. **Meeting track.** Per-app capture of the app and its child processes. Whole-computer capture as the fallback the user picks.
2. **Mic track.** Shared mode with a 2 s buffer, on a high-priority audio thread. Follows the communications default when "system default" is selected.
3. **Helper program.** `native/windows-capture/`, speaking one line of JSON per message with the app core. Closing its input stops and finalizes the recording, so a dead app never leaves chunks open.
4. **Windows audio is always converted to 48 kHz by Windows itself**, so all chunks on this platform are 48 kHz. Rate halving was not seen on Windows, but D5 stays on as a check.

**Changes required to the branch code:**

| # | Change | Why |
| --- | --- | --- |
| 1 | Add a mic-test mode with no session | `open` needs a session and creates the meeting folder, which breaks the rule that a test keeps nothing |
| 2 | Start with one track if only one opens (C10) | Today a failed mic stops the meeting audio from recording too |
| 3 | Stop automatic widening to whole-computer audio (W2) | Any failed per-app open, including during a reopen, switches to capturing every app for the rest of the recording. It raises an event, but this goes further than the "never widens on its own" rule its README records for an app that exits |
| 4 | Limit flag-only splits (C4) | 4 flags a second on hands-free |
| 5 | Replace the single death limit with the C5 limits, and warn at 3 s | Up to 30 s can pass before recovery today. The helper raises a stall event, but nothing shows it to the user yet |
| 6 | Report dropped audio when the 60 s write queue is full | It is dropped silently now. Only the timestamp gap shows it, with cause "unknown" |
| 7 | Tell hands-free Bluetooth from stereo Bluetooth | `BTHENUM` is labelled hands-free, which is unverified, and would raise false warnings |
| 8 | Bundle the C runtime and update the contract findings | Needed to ship. The README lists the runtime fix |

## How it could lose data, and the test that proves each is handled

| Failure (Phase 0 result) | What the adapter does | Test | Where | Gate 2 clause |
| --- | --- | --- | --- | --- |
| **Mic does not follow a device change.** Stayed on the old mic in the input-switch and Bluetooth-connect cases | Listens for the default change, waits 5 s for stability, reopens if "system default" is selected. Offers the switch if a mic was picked. Marks the gap | T7 `input-switch` on hardware | H | Device change |
| **Default flaps.** Every 4 s for 50 s by itself | Debounce: only reopens when stable | T8 invented notifications, plus a real run | U + H | Device change |
| **Stream dies silently.** Stopped at 72.9 s, no error | Device signals act at once. Otherwise the arrival watchdog warns at 3 s and reopens at the C5 limits. A picked mic falls back with a warning | T6 fault hook and real `bt-disconnect`, plus USB unplug | F + H | Stopped stream |
| **Windows Audio restarts.** Not measured on Windows. Killed Mac capture silently | Treat as all tracks dead. Reconnect device notifications. Reopen attempts time out after 2 s and retry every 5 s. Whole-computer is not used as a shortcut | T17 `Restart-Service Audiosrv -Force` in an admin terminal | H | Stopped stream |
| **Hands-free switch.** 1.4 s of digital silence, no flag | Cannot be detected for sure. Zeros near a device event get a "possibly missing" mark | T3b, real `bt-call-mode` | U + H | Marking |
| **Hands-free mic is lossy.** About 222 of 298 s lost in one run | Warn once, suggest the built-in mic, mark every gap, cap flag splits | T12, T21 | U + H | No lost audio |
| **Rate halving.** Macs only so far | D5 runs anyway. Duration must match the clock while on hands-free | T9 | H | Drift target |
| **Modern Standby.** Track ended 1.69 s short, no flag | Close chunks at suspend. After wake, drop the stale burst and open new chunks. If the notification is missed, the clock check catches the sleep | T11 replay, plus real `sleep-wake` | U + H | Pauses / drift |
| **S3 sleep or hibernate.** Unmeasured (Q1) | Same path. If the clock stops, both tracks are still in step, and only the "asleep" length could be wrong | T11 on an S3 machine, if available (W3) | H | Pauses / drift |
| **Mic privacy off.** Stopped silently, did not return | Read the Windows consent settings once a second, read-only. Warn, mark the gap, reopen when access returns. Covers both the master switch and the desktop-apps switch | T20 `mic-privacy-off` | H | Stopped stream |
| **Whole-process stalls.** 23 in 8 h, up to 13.8 s | No reopen during a stall. Gap marked from timestamps. Heavy AI work stays in other processes at lower priority | T4, T19, T23 | U + F + H | No lost audio |
| **Meeting audio in a stall.** Branch lost 3.98 s of a 4 s fault, against the Phase 0 claim of none | Unknown. Process loopback cannot take a longer buffer, so if T23 shows real loss, this is a known limit reported under C6 | T23 audible pulse train under real load | H | Mic loss |
| **Whole-computer capture with nothing playing.** Delivers no packets, which would look like a dead stream | Keep a silent output stream running, as the branch does | Whole-computer run with silent spells, added to T6 | H | Stopped stream |
| **Target app exits or restarts** | Rule C1: warn, keep the mic, mark the meeting track, reattach on return. The timer lives in the app core | T15 plus a Teams restart | H | Stopped stream |
| **Disk write failure** | Report at once, keep trying. Full handling in the crash-safe plan | Crash-safe plan | F | No lost audio |

## Gate 2 runs on this machine

All are hands-on, on the Dell Precision 7760 unless noted, with output muted except where sound is required.

| Run | Time | Needs from you |
| --- | --- | --- |
| The six unrun device cases, plus debounce | About 1 hour | Be at the PC; headset; admin terminal for the service restart |
| T15, 8-hour recording with pauses, one device change, one forced worker kill | 8 hours, mostly unattended | Start it, do the device change |
| T18, a real Teams or Zoom call | About 1 hour | An account and a second device. Invented content, no other people |
| T19, 8-hour loss run under normal load | 8 hours, can share with T15 if you accept it | Nothing extra |
| T23, stall with audible pulses | 30 minutes | Nothing extra |
| USB unplug and docking station | 15 minutes | A USB mic and a dock, not available so far (W3) |

Any step with a time in it shows a live on-screen countdown. Test audio is tones and AMI fixtures, never your real meetings.

## Decisions for the owner

**W1. What happens to the `windows-capture` branch?**
Option 1: use it as the starting point, reviewing it against this plan. Option 2: discard it and rewrite.
*Recommendation: keep it as the starting point, and merge nothing until this plan is approved and its tests are run.* Its fault tests and the standby finding are real value. Approving this does not approve the code.

**W2. If per-app capture fails mid-meeting, may the app switch to whole-computer audio by itself?** That keeps the meeting audio, but also records every other app, such as a private video or call, and you may not notice. The branch does this today and stays that way for the rest of the meeting.
*Recommendation: never automatically.* Keep retrying per-app capture, warn at once, mark the gap, and offer a one-click switch. This matches your rule for an app that exits. The cost is a marked gap until you respond.

**W3. Which missing hardware should Gate 2 wait for?** So far there is no USB mic, no docking station and no known machine with S3 sleep. The Development Plan's hardware list includes the first two.
*Recommendation: get a USB mic and test a dock before Gate 2, since both are cheap and common. Do not wait for an S3 machine.* Record it as a known limit instead, since the Dell uses Modern Standby and a wrong answer can only mislabel a sleep span.

Decisions C1, C4, C5, C6, C7 and C10 in the contract plan also shape this adapter.

## After approval

Cycle: Gate 1 approved, contract plan approved, then review the branch against this plan, make the changes above on a branch, run each named test, and report the results here. You approve the merge. The Windows workstream must not change macOS code or the session schema.
