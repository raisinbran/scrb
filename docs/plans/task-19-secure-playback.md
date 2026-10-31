# Task 19 — gap-aware audio playback plan

**Type:** Plan → Diff. **Base main:** `7790843`. **No code before primary-agent approval of the secure audio path.**

## Required behavior

`seekAudio({meetingId,positionMs})` begins playback from readable **sealed** audio, `pauseAudio` stops it, and `playbackPosition` reports clock position and playing state. The UI must not receive direct filesystem paths or gain filesystem privileges. On a meeting still being written, requests beyond the end of the last sealed chunk fail `conflict`; never delay the recording writer. On a missing/deleted audio track, report unavailability and don't fake silent playback.

## Recommended architecture

1. **Main-process playback service:** validate meeting ID against the library, prevent path traversal, enforce `audioDeletedAt === null`, and read only manifest-listed chunks that exist within that meeting's `audio/` directory; recheck realpaths/symlinks and do not follow external files. Treat `chunks.json` as untrusted local input.
2. **Audio transport:** use an app-owned, scheme-registered, read-only media handler with a narrow per-meeting nonce (not exposed as an absolute path), HTTP Range-equivalent bounded reads, and standard browser audio playback. Register as a **separate constrained resource URL**, not a Node-enabled renderer API. The existing `scrb:call`/`scrb:event` channels remain unchanged. If the existing app security layer cannot safely serve registered media, propose a minimal owner-reviewed IPC resource grant before writing code.
3. **Timeline:** manifest timestamps and confirmed `TimelineGap` spans determine segment alignment. Pause and missing gaps are represented as *non-audio intervals*, never silently shifted. Seek into a gap lands at the next readable chunk (or holds at the gap end if none); show original timeline time. Two tracks play synchronized from common timestamps.
4. **Performance:** decode only needed ranges, close readers on stop/meeting switch, cap concurrent media sessions, and avoid lengthy conversion or busy polling in the recording process.

## Acceptance / failure matrix

| Condition | Test |
|---|---|
| Seek into sealed chunk | Plays at correct clock, `playbackPosition` monotonic |
| Seek into pause/missing gap | Advances to next chunk without hiding the gap label |
| Seek after last sealed chunk while recording | Returns `conflict`; capture proceeds |
| While chunk being sealed / partial or corrupt chunk | Refuses/limits unsafe read, no crash |
| Audio deleted, wrong meeting, symlink escape | `notFound`/`conflict`; no data from other folders |
| UI reload or unsubscribe | Releases stream, sends no orphan events |
| Two tracks differ or one absent | Timeline follows only saved chunks and shows missing track |

**Recommendation:** implement secure media delivery as an app-owned read-only protocol, with no general file URL support. This is a security/IPC-sensitive change; owner review required before code. **Not run:** `npm run check`, Electron media/security smoke, macOS/Windows playback or latency tests.