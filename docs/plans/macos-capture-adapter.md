# Plan: macOS capture adapter

Status: **Approved by the owner on 2026-10-30, with every recommendation accepted except as noted in `docs/handoffs/2026-10-30-owner-decisions.md`. Code starts in its phase, after the gate before it.**

**Long runs changed (owner, 2026-10-30):** Gate 2 now uses a 4-hour run, so read 4 hours wherever this plan says 8 for T15 or Gate 2, and scale per-run figures to match. Details are in `docs/handoffs/2026-10-30-owner-decisions.md`.

**Pause changed (owner, 2026-10-30):** the adapter implements the shared gate, command IDs and `audio/session.log` in `docs/plans/pause-resume.md`.

Date: 2026-10-30. Base commit: `4abe340`. Depends on `capture-contract-and-clock.md`, whose rules (D1 to D10), tests (T1 to T24) and decisions (C1 to C10) are used here.

Sources: Gate 0 evidence (Apple Silicon sections), `phase0/probes/macos-dual-capture/`, and the Windows branch's results where they apply.

## In short

This plan builds the Mac side of recording: per-app meeting audio plus your mic, surviving every failure Phase 0 found. Only a throwaway probe exists so far, and it has no recovery of any kind. The worst Mac result was that a system audio restart ended capture silently and the probe recorded nothing for the remaining 5 h 50 m while reporting success.

The full 8-hour Mac run has **never completed**. Gate 2 is where it must.

## What changes

1. **Meeting track.** A Core Audio process tap on the meeting app, read through a private aggregate device, which macOS needs in order to deliver the audio. Whole-computer fallback is a global tap that excludes this app.
2. **Mic track.** Runs on the high-priority audio thread. That cut stalls from 6 to 2 an hour in Phase 0. No file work happens on that thread: it hands audio to a writer thread.
3. **Helper program.** `native/macos-capture/`, in Swift like the probe, speaking the same line-by-line protocol as the Windows helper, so the app core treats both the same.
4. **One rebuild path.** Output changes, hands-free switches, wake and audio-service restarts all go through the same routine: close chunks, destroy the tap and aggregate, rebuild, **read the real rate**, open new chunks. One path means one thing to test.
5. **Sleep-aware clock.** Mac hardware time stops during sleep, so each chunk's time adds a sleep offset read when the chunk opens.
6. **Permission handling.** Ask for System Audio Recording explicitly, and detect the all-zero result.

## Risks to settle first

These can change the design, so they run as the first step of the build, before the rest.

| # | Question | Why it matters |
| --- | --- | --- |
| S1 | Does a tap that needs no headset clock work, for example an aggregate clocked by the built-in output? | If so, hands-free halving and most rebuilds go away. Unproven |
| S2 | Does a tap keep delivering packets when the target app makes no sound? | Windows does (F14). If macOS does not, the watchdog would call a quiet meeting a dead stream |
| S3 | Does the tap survive changes to the app's process list, and can the list be updated without a rebuild? | Each rebuild costs a small gap. Teams and Zoom spawn helpers (Q6) |
| S4 | What exactly happens to a running app when mic or System Audio permission is turned off? | Never measured on Mac. macOS may end the process, in which case this becomes a crash-recovery case |
| S5 | Is there a signal for "the audio service restarted"? | Faster than waiting on the watchdog. The watchdog stays as the backstop either way |
| S6 | Does `kAudioProcessPropertyIsRunningOutput` tell a denied tap from a silent app (Q3)? | Without it, D7 cannot separate "no permission" from "quiet meeting" |

## How it could lose data, and the test that proves each is handled

| Failure (Phase 0 result) | What the adapter does | Test | Kind | Gate 2 clause |
| --- | --- | --- | --- | --- |
| **`coreaudiod` restarts.** Restarted 2 h 09 m in, no error, nothing recorded for 5 h 50 m | Both tracks silent while the watchdog runs on time: warn at 3 s, treat as all-tracks dead at 5 s. All audio objects are invalid after a restart, so rebuild from nothing: re-find the app's processes, new tap, new aggregate, new mic stream, new listeners. Retry until it works, and warn persistently if it does not | T17 `killall coreaudiod`, run by you (M3) | H | Stopped stream |
| **Mic does not follow a device change.** Stayed on the old mic | Listen for the default input, wait for 5 s of stability, reopen if "system default" is selected, offer if a mic was picked | T7, T8 | U + H | Device change |
| **Stream dies silently.** AirPods removed at 70 s: no packets, no error | Listen for "device is alive". Watchdog as backstop. Reopen, then fall back with a warning | T6 AirPods disconnect, USB unplug | F + H | Stopped stream |
| **Hands-free halves the rate.** 24 kHz delivered, 48 kHz assumed, no flag | Read the rate after every build, listen for rate changes, measure frames against time. New chunk at the real rate, so duration stays right | T9 | U + H | Drift target |
| **Our own mic can cause this.** Using AirPods as the mic puts them in hands-free, which can halve the meeting track | Warn when a Bluetooth mic is selected, suggest the built-in mic. Test starting on, and switching to, hands-free, because Phase 0 saw halving in one direction only | T9, T12 | H | Drift target |
| **Fallback jump.** 35 s of silence padded in one step on the switch back to speakers | Never pad. The rebuild closes the chunk, and the span becomes a marked gap | T9 | H | No lost audio |
| **Default output changes** | Rebuild the tap. The probe used the *system alerts* output, so the adapter must watch the real default output too | T7 | H | Device change |
| **Sleep.** Hardware time stopped: 55 s of sleep appeared as a 24 s jump, 65 s unaccounted for | Hold the keep-awake request while recording, so only lid close or a manual sleep can do this. At will-sleep, close chunks before allowing sleep. At wake, re-read the offset, rebuild, open new chunks. The span is "computer asleep". The test must also explain the extra 10 s | T11 | F + H | Pauses / drift |
| **Permission never granted.** Tap runs normally and delivers exact zeros, no prompt, no error | Ask during setup. Zero audio while the app is known to be playing raises `permissionLost`. The mic test's meeting meter is a second check | T10 on a **packaged** build | F + H | Stopped stream |
| **Permission revoked mid-recording.** Unmeasured | Per S4. Warn, mark the gap, recover when granted back. If macOS ends the helper, recovery uses the crash-safe plan | T20 | H | Stopped stream |
| **Mic privacy off mid-recording.** Unmeasured | Same | T20 | H | Stopped stream |
| **Short stalls.** 3 to 7 an hour, up to 0.4 s, both tracks, with or without load | Below the 500 ms stall limit, so D1 marks them from timestamps. Never padded | T5 | U + H | No lost audio |
| **Stalls under load** | AI workers run at lower priority than capture. Lost audio is measured apart from sync | T19 | H | Mic loss |
| **USB or Bluetooth mic drift.** Unmeasured: built-in devices share one clock, so the near-zero drift says nothing here | Per-chunk timestamps are the design answer, and need proof | T1 rule, 1-hour runs on AirPods and USB | H | Drift target |
| **Target app restarts or spawns helpers** | Rule C1. Watch the process list and re-target, per S3 | T15 plus a Teams restart | H | Stopped stream |

## Gate 2 runs on this machine

All on the M5 Mac, macOS 27.0.1, unless noted. Tests must run from a build with its own permission. Phase 0 showed macOS can blame the wrong app for a process started by another tool, which made tracks silent with no error.

| Run | Time | Needs from you |
| --- | --- | --- |
| S1 to S6 | A few hours, mostly mine | Approve permission toggles; AirPods |
| Device cases: mic switch, output switch, AirPods on, off, hands-free | About 1 hour | Be at the Mac, AirPods |
| T11, real sleep and wake | 15 minutes | Sleep from the Apple menu, and wake it |
| T17, `coreaudiod` restart | 15 minutes | Admin password. All Mac audio drops for a moment (M3) |
| T20, privacy switches | 20 minutes | Toggle them in System Settings |
| T15, 8-hour recording with pauses, a device change and a forced kill | 8 hours, mostly unattended | Mac on power, start it |
| T18, a real Teams or Zoom call | About 1 hour | An account and a second device. Invented content, no other people |
| T19, 8-hour loss run under normal load | 8 hours, can share with T15 if you accept it | Nothing extra |

Any step with a time in it shows a live on-screen countdown. Test audio is tones and AMI fixtures, never your real meetings.

**Known limit:** results cover one Mac on one macOS version. V1 supports M1 or newer, with 14.2 as the technical floor. Older versions stay untested until a machine is available.

## Decisions for the owner

**M1. How should the Mac app be signed?** V1 says builds are "unsigned or self-signed". But macOS ties the System Audio permission to the app's identity. Phase 0 already saw a setting show "enabled" while recording was denied. An unsigned build has no steady identity, so a new build may lose the permission, and the result is **silent zeros in the meeting track, not an error**.
*Recommendation: use one stable self-signed certificate for every build, and prove with a test that an upgrade keeps the permission. If that test fails, look for a workaround first.* (Owner, 2026-10-30: avoid the recurring $99 Apple Developer ID unless the app cannot work without it.) This needs testing before Phase 8, because capture depends on it. It narrows the V1 wording from "unsigned or self-signed" to self-signed for the Mac.

**M2. What rate should hands-free meeting audio be saved at (Q5)?**
*Recommendation: save at the rate delivered (24 kHz), and resample only rates Opus cannot use, such as 44.1 kHz.* Upsampling adds no quality, and fewer steps means fewer ways to go wrong. Speech recognition uses 16 kHz anyway.

**M3. May the `coreaudiod` restart test run?** Gate 2 requires it, and the draft calls for your approval. It needs your admin password and interrupts all Mac audio for a moment.
*Recommendation: approve, run by you at a time nothing else is playing.* The same applies to the Windows Audio restart.

Decisions C1, C4, C5, C6, C7 and C10 in the contract plan also shape this adapter. C5 sets the 5 s limit above.

## After approval

Cycle: Gate 1 approved, contract plan approved, then S1 to S6, then build on a branch with the shared rules from `packages/capture`, run each named test, and report the results here. You approve the merge. The macOS workstream must not change Windows code or the session schema.
