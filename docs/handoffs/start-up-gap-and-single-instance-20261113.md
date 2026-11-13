# Start-up gap marker and stale app instance (2026-11-13)

**Cause (from code, not from the owner's recordings):** `trackGaps` in `packages/app-core/src/recovery.ts` marks `audioMissing` from 0 to the first chunk's start if that start is 100 ms or later. The 100 ms limit came from Windows timing. On the Mac each track's first buffer arrives a fraction of a second to a second after Start, so every recording got "Gap in the audio from 0:00:00 to 0:00:01".

**Fix:** on macOS the limit is now 2 s (`lateStartNsFor`, passed to `sealAudio` by `recording.ts`); Windows keeps 100 ms. Nothing was said before a track's first audio, so the timeline simply begins there. A first chunk at 2 s or later is still reported, as is any mid-recording gap. The 2 s value is a judgment, not a measurement: check a real Start-to-first-chunk time on a Mac recording and lower it if start-up is always well under 1 s.

**Not done:** a "Starting..." state between Record and capture being live. It needs a new status the contract lacks, so it needs owner approval of a contract change.
