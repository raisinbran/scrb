# Windows recording/import preemption follow-up

Base: PR #33 `45172079ba3ae45d4ac5b718665797093d33256e`, stacked on
PR #30 `8e02da6f1166f01a29665d9eba7fc92e6319b664`.

The owner-approved callback from `2026-11-01-task18-pr33-integration.md`
is integrated. Record claims its existing Start guard, stops the mic check,
then awaits import preemption before source discovery or capture startup.
Imports consult the controller's busy state, including pending Start and
Stop cleanup. The existing catch/finally path releases Start after failure.
The PR #30 live setup and native capture path are unchanged.

## Verification

- Focused recording/import suites: 28 tests passed. New regressions cover
  capture waiting for preemption, fresh imports and duplicate Starts being
  refused during the wait, and retry after preemption failure.
- Desktop TypeScript and changed-file ESLint passed. Boundary command
  skipped because this branch has neither the ui/ nor backend/ prefix.
- One short physical Windows run used the existing compiled helper and
  live configuration, real Library and production controllers. An active
  simulated import worker was aborted; capture did not create a meeting
  while staging cleanup was held. A fresh import was refused. After
  cleanup release, native capture started and saved an Opus chunk and
  manifest for each track. Stop finalized the meeting as ready.
- Capture confirmation after cleanup release: 2017.0 ms. Stop through
  finalization: 196.4 ms. These are one-sample backend completion times;
  visible UI acknowledgment was not measured by this smoke.
- The existing invented source fixture remained byte-identical. The
  preempted import emitted recordingInProgress and left no active job.
- Test review was performed directly; no internal subagent was started.

Raw task-local evidence is outside Git in `../gate3-import-evidence/`:
`native-smoke.json`, `native-smoke.txt`, `native-smoke.ts`, and the focused
suite/typecheck logs in the workspace parent.

## Remaining acceptance gaps

The simulated worker does not establish real codec/model import behavior.
The Windows FFmpeg build remains blocked on its dependency-generation awk
syntax error. No decoder rebuild or toolchain installation was attempted.
Actual picker/UI import acceptance, supported codec/model checks and
Task 19 playback remain separate work. This small scheduling change still
needs independent review and final-head cross-platform CI. No merge,
endurance rerun or Gate 3 approval was performed.
