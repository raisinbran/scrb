# Gap reason is not available to the UI

The transcript gap label can now say which track is missing (`TimelineGap.track`) but not why. A microphone gap caused by a muted or blocked microphone (chunk `closeReason`/`openReason` `permission`) looks the same to the UI as any other `audioMissing` gap, so it reads "Microphone audio missing" instead of the clearer "Microphone muted or blocked".

Needs an owner-approved contract change: an optional `reason?: 'permission' | 'device' | 'sleep' | 'unknown'` on `TimelineGap` (`packages/contracts/src/types.ts`), filled by the backend from the chunk close/open reasons, then used in `gapLabel` in `apps/desktop/src/ui/screens/recordings/TranscriptTab.tsx`. Not done here.
