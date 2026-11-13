# Final-pass progress for the UI (2026-11-13)

**Gap:** the contract reports no progress for the final pass. `MeetingListItem` and `Meeting` carry only `status: 'finalPassRunning'`, and no event gives a fraction. Imports (`ImportProgress.fraction`), summaries (`SummaryProgress.fraction`) and model downloads (`bytesDone/bytesTotal`) already do, and those bars now fill.

**UI today:** the final-pass banner shows a full, slowly breathing bar with no position, because a guessed fraction would mislead.

**Needed (owner approval, `packages/contracts/`):** a `finalPassProgress` event `{ meetingId: MeetingId; fraction: number }`, with `fraction` 0 to 1 across the whole final pass (audio decoded and transcribed so far over total audio), added to the event map and `EVENT_NAMES` allowlists. The mock backend should emit it while `finalPassRunning`. The UI then passes `fraction` to `<Progress>` in `ProcessingBanner`; no other UI change is needed.
