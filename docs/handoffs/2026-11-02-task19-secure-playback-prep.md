# Task 19 — separate secure playback integration handoff

**Status:** Implementation preparation only; Task 19's plan was approved in Issue #31, not a contract change or Gate 3 acceptance.
**Base:** PR #30 `8e02da6f1166f01a29665d9eba7fc92e6319b664`.
**Boundary:** Work stays on this Task 19 branch; do not edit PR #33's import files or merge either PR.

## Existing interfaces and the unresolved security boundary

- The trusted main process already has `Library.getMeeting`, `Library.meetingPaths`, and sealed capture `audio/<track>/chunks.json` or live `chunks.log`.
- The approved contract has `seekAudio({ meetingId, positionMs }): void`, `pauseAudio({ meetingId }): void`, and `playbackPosition` events; they are currently not wired to real audio.
- The sandboxed renderer has **no permitted resource URL, media grant call, or app-owned audio stream**. The approved Task 19 design requires an app-owned read-only resource protocol. Do not implement an unbounded `file://` path, arbitrary media IPC, renderer Node access, or `scribe://app` media dispatch to work around this gap.

**Owner approval needed before the media-grant/contract slice:** propose precisely one `getPlaybackMedia` call in `packages/contracts/src/backend.ts`:

```ts
getPlaybackMedia: {
  request: { meetingId: MeetingId; positionMs: number };
  response: {
    chunks: Array<{
      track: 'microphone' | 'meeting';
      startMs: number;
      endMs: number;
      url: string;
    }>;
    nextPositionMs: number | null;
  };
};
```

The call returns at most one *sealed* chunk URL per available track and the next playable boundary; the renderer renews grants for subsequent chunks as playback advances. URLs use a separate, app-owned `scribe-media://` scheme, randomly scoped to a short-lived per-meeting session, never filesystem paths. Retain existing `seekAudio`, `pauseAudio` and `playbackPosition` semantics; no new event channel.

This is an **unapproved contract proposal**, not permission to edit `packages/contracts/`. If an equally narrow existing approved mechanism becomes available before implementation, prefer that.

## Implementation sequence after grant approval

1. New `apps/desktop/src/main/playback-media.ts`: read-only media-session coordinator. Authorize only existing meeting IDs with saved, undeleted audio; bind a nonce to that meeting and current main window/session. Revoke on pause, switch, delete, close, expiration, or window reload.
2. New read-only `scribe-media` registration in `security.ts` and `main.ts` (separate from `scribe://app`). Authenticate nonce, meeting, exact track and sealed file, range and maximum response size. Use canonical realpath checks against the chosen meeting's `audio/` directory, disallow traversal and symlinks leaving it. Return standard audio headers, bounded Range responses, and close file handles promptly.
3. For stopped meetings, parse and validate `schemaVersion: 2` `chunks.json` with `origin: recorded|imported`, `file`, nanosecond timestamps, `preSkip`, `state`, and `gaps`. Treat imported empty `gaps` as valid. On live recordings, trust **only complete lines** in `chunks.log` that refer to fully closed existing chunks, never `.part`; requests past the last sealed chunk return `conflict`.
4. Implement `seekAudio`/`pauseAudio` and main-process clock/status with monotonic original meeting timeline. Renderer plays two synchronized HTML audio streams/chunks; preserve pauses and missing spans rather than compressing time. If one track is absent, play only the surviving track; never invent silence or an available track.
5. UI adapter in `apps/desktop/src/ui/screens/recordings/` consumes the approved grant and mirrors existing `playbackPosition`. Keep UI files separate from protected backend modules and existing PR #33 modifications.

## Focused acceptance tests

- Invented valid/invalid recorded and imported v2 manifests, damaged JSON, newer schema, out-of-order timestamps, unsafe file names, missing/corrupt chunk and symlink escape.
- Cross-meeting nonce reuse, stale expiry, invalidated token on switch/delete/reload, unauthorized scheme origin, oversized/bad byte ranges and concurrent readers; no general filesystem read.
- One sealed chunk, seek in pause/missing gap, seek beyond last live chunk, incomplete live log line, writer continuing without read lock, full dual-track alignment and missing one track.
- Actual Electron sandbox + resource-scheme tests, Windows and macOS click-to-play using public audio, verify capture remains uninterrupted.

**No native capture, shared contract, or security configuration is modified in this preparation branch.** No import decoder or coordinator files overlap PR #33. Do not claim click-to-play works, native QA passes, or Gate 3 is approved.


## Unwired source foundation added to this draft PR

- `apps/desktop/src/main/playback-media-source.ts` has a bounded, read-only chunk reader that checks meeting authorization, deleted/importing state, recorded/imported v2 manifest membership, complete live `chunks.log` entries, safe chunk names, realpaths and symlink containment in the meeting/audio/track hierarchy, and at most 1 MiB per read.
- `playback-media-source.test.ts` uses only invented bytes and covers authorized bounded reads, unlisted/deleted resources, cross-meeting lookup, symlink escape (macOS/Linux) and incomplete live log lines.
- **Not connected:** protocol, nonce/session management, `seekAudio`, `pauseAudio`, renderer playback, gap alignment or range HTTP semantics. Do not treat this reader as a complete security review or functioning playback.
- The single grant proposal above **still requires express owner approval** before `packages/contracts/` or any new IPC/security settings are edited. The source reader is internal to the main process and does not expose a renderer API.
