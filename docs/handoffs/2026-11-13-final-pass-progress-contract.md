# Handoff: final-pass progress in the contract (proposal, needs owner approval)

The UI shows only an indeterminate bar and an estimated elapsed time while a meeting is in `finalPassRunning`, because `@scrb/contracts` has no final-pass progress.

**Proposal.** Add event `finalPassProgress: { meetingId; stage: 'queued' | 'transcribing' | 'diarizing' | 'finishing'; fraction: number /* 0..1 */; startedAt: string }`, mirroring `ImportProgress`, and emit it from the final-pass runner via the hybrid backend. Optionally add `finalPassStartedAt` to `MeetingDetail` so the elapsed time survives a reopened screen and excludes paused time.

**UI follow-up once approved.** Replace the indeterminate bar in `ProcessingBanner.tsx` with a determinate bar and stage label; add the event to the mock backend and the contract tests.
