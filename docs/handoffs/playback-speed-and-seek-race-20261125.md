# Playback speed and a seek/pause race (handoff, 2026-11-25)

## 1. Playback speed needs a backend and contract change (not done)

The audio clock runs in `apps/desktop/src/main/playback-media.ts` at real time (`anchorMs + now - anchorAt`) and emits `playbackPosition` every 250 ms. The renderer (`lib/playback-engine.ts`) follows that clock and only restarts when the backend is more than 250 ms ahead. Setting `audio.playbackRate` in the UI alone would:

- at 0.5x, drift behind the backend until `JUMP_MS` forces a restart roughly every second;
- at 2x, play ahead of the backend, so the displayed position and the position returned by `pauseAudio` are wrong.

Needed: a rate on `seekAudio` (or a new `setPlaybackRate` call) in `packages/contracts` (owner approval and an `APPROVALS.md` row), the clock in `playback-media.ts` scaled by that rate, and the engine applying `playbackRate` to every element and scaling its local clock. The UI then adds one speed button (menu 0.25x to 2x, fixed width, opens upward near the bottom).

## 2. Cause of "That audio is not saved yet." and silent Play

In `playback-media.ts`, `pause()` and `stop()` increment `turn`. `seek()` captures its turn, awaits `readPlaybackTimeline`, and if the turn changed it returns without creating a session and without an error. The caller sees a successful `seekAudio`, then `getPlaybackMedia` finds no session and throws `notSaved()`.

Trigger: `ClipPlayer.endSession()` sent `pauseAudio` without waiting, and the next `play()` sent `seekAudio` straight after. If the pause is handled while the seek is reading the timeline, the seek is silently cancelled. Result: (a) the red "not saved yet" error on the first click, working on a later one; (b) when the shared player's `seek` sees `latest.isPlaying` false it halts, so Play makes no sound and no error. This was derived from reading the code and tested at unit level; it was not reproduced in the running Electron app.

UI-side fix in this PR: `ClipPlayer.play()` waits for the previous clip's `pauseAudio` reply before seeking (`lib/clip-player.ts`, with a test).

Suggested backend hardening (not done): a seek superseded by a newer turn should reject with a clear error instead of returning, so a lost race is never silent. The shared player's own Pause then Play path was not changed.
