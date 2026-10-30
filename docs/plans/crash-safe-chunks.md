# Plan: crash-safe chunks and recovery

Status: **Approved by the owner on 2026-10-30, with every recommendation accepted except as noted in `docs/handoffs/2026-10-30-owner-decisions.md`. Code starts in its phase, after the gate before it.**

**Long runs changed (owner, 2026-10-30):** Gate 2 now uses a 4-hour run, so read 4 hours wherever this plan says 8 for T15 or Gate 2, and scale per-run figures to match. Details are in `docs/handoffs/2026-10-30-owner-decisions.md`.

Date: 2026-10-30. Starts from commit `4abe340`.

Depends on the capture contract and session clock plan, which is not written yet. This plan uses
`phase0/design/capture-contract-draft.md` as its base. If that plan changes the chunk rules, this
one is updated.

Sources: Development Plan v2.0, V1 Requirements v1.2, `phase0/evidence/gate-0.md`, the capture
draft, `packages/storage`, `packages/transcription`, and the owner decisions of 2026-10-30.

## In short

- Audio is saved while it is captured, so a crash can only cost the last moment of a meeting.
- After a process crash, about 1 second can be lost. After a power cut, about 5 seconds. The app
  shows exactly where the audio stops. These limits are decision 2.
- Half-finished chunks are kept and repaired, never thrown away.
- A chunk file describes itself, so a meeting's chunk list can be rebuilt from the audio alone.
- Each chunk can be played on its own, with no lost slivers of sound. Left unhandled, the 6.5 ms
  issue would remove about 37 seconds from an 8-hour track.
- Recovery never deletes audio, and it can itself crash and start again safely.
- `packages/contracts` does not change. It already has `recovered`, `recoveredEndMs` and `gaps`.

Eight decisions are needed from you. See "Decisions for the owner" near the end.

## What changes

### While recording

1. **The app creates the meeting first.** `meeting.json` is saved with status `recording`, then
   `audio/session.json` with the session's start time. Only then does audio start.
2. **The audio worker holds a lock** on `audio/writer.lock` for as long as it writes. The operating
   system releases the lock the instant the worker dies, however it dies. Recovery can therefore
   always tell a dead writer from a live one.
3. **Each chunk is first written as `000123.opus.part`.** Audio is added once a second as a small
   checksummed block (an Ogg page) and handed to the operating system at once.
4. **Closing a chunk:** finish the file, force it to disk, rename it to `000123.opus`, force the
   folder to disk, and add one line to `chunks.log`.
5. **At Stop:** the app core turns each track's `chunks.log` into a sealed `chunks.json`, then
   changes the meeting's status to `ready`, then removes the log and the lock.

Capture never waits on the disk. Audio passes through a 30-second holding buffer in memory, and a
separate thread does the writing. If the disk stalls for longer than that, the audio that overflows
becomes a marked gap, and recording carries on.

The separate live feed to the transcriber (owner decision 2) leaves the same buffer. If the
transcriber falls behind, that feed drops audio. Saved audio is never affected.

### Files in a meeting folder

```
audio/
  session.json          start time and clock type; written once at the start
  session.log           pause, resume and pauseFailed records (see pause-resume.md)
  writer.lock           held by the audio worker only while it writes
  microphone/
    000000.opus         finished chunks
    000001.opus.part    the chunk being written
    chunks.log          one line per finished chunk; only while recording
    chunks.json         the sealed list; written at Stop or by recovery
    damaged/            anything recovery could not read; kept, never deleted
  meeting/              the same files
transcript.final.json   final-pass output, only until it is merged into transcript.json
```

### The chunk format

The format stays as Gate 0 settled it: Ogg Opus, mono, 32 kbps, 20 ms frames, voice mode, 5 s long,
closing early on the events in the capture draft (section 3). This plan adds:

- **One Ogg page per second**, already allowed for in the measured 10 to 14 MB per track-hour.
- **Facts stored inside the chunk** (in the file's tag block): meeting ID, track, sequence number,
  start time, delivered rate, why it opened, and the format version. No title or other meeting
  content goes there.
- **What a chunk's start time means:** the first sample you actually hear from that file, not the
  first sample fed to the encoder. The 6.5 ms section below depends on this.
- **Durations come from the file's own position marks.** These always count at 48 kHz, even when a
  Bluetooth headset delivers 24 kHz (Gate 0 finding F10).

The chunk writer is one shared native component used by both capture adapters, so the two operating
systems cannot drift apart in the files they write.

This refines one Development Plan rule. "Written to a temporary name, then renamed" still holds for
every other file, but a half-written chunk is deliberately kept, because it holds real audio.

### Why two manifest files: `chunks.log` and `chunks.json`

An 8-hour track has 5,760 chunks, so its list is about 3 MB. Rewriting and force-saving that every
5 seconds is too much disk work for an audio process. So:

- **`chunks.log`** gets one line added per chunk. A cut-off last line is ignored.
- **`chunks.json`** is written once, at Stop or by recovery, with the storage package's safe write.

The chunk files stay the true copy. The log is a shortcut that also holds what is only known at
close: the close reason, padded spans, and whether the chunk was all zeros. If the log is lost,
stamps still place every chunk and find every gap. Only those close-time details read "unknown".

`chunks.json` keeps its place in `audio/<track>/`, so imports and recordings share one format. It
holds the fields in the capture draft (section 3), and adds:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | 2. The current file says `version`, which the storage upgrade ladder cannot read |
| `origin` | `recorded` or `imported`; imported chunks have no device fields |
| `endedBy` | `stop` or `crash` |
| `endNs` | Where this track's saved audio ends |
| `gaps` | Each missing span: kind, cause, start and end |
| per chunk: `file`, `preSkip`, `state` | File name, how much to skip at decode, `complete` or `recovered` |

Three additions to the capture draft's lists: close reasons `recovered` and `appLost`, and gap cause
`disk`. On disk the mic track is `microphone`, as in the folder name; code that says `mic` maps to
it in one place. Nanoseconds stay on disk, and `startMs` and `durationMs` are worked out in one
place for the code that uses milliseconds.

`transcript.final.json` becomes a short-lived checkpoint with three rules:

- It is saved safely (flushed, then renamed), with `schemaVersion` and a record of which chunks it
  was made from.
- It is only used if those chunks still match, so old text is never applied to changed audio.
- After `Library.applyFinalPass` merges it into `transcript.json`, it is deleted (decision 8).
  Workers still never write `transcript.json`.

### Recovery

It runs at app start, away from the main thread, for each meeting that `Library.reconcile` reports
in `interruptedRecordings`:

1. **Make sure the writer is dead.** Try to take `writer.lock`. If a worker still holds it, ask it to
   stop and wait. If it does not let go, leave the meeting alone and try later. Never force it.
2. **Repair each `.part` file.** Copy every page whose checksum passes into a new file, mark its end,
   save it safely as `.opus`, check it, and only then remove the `.part`.
3. **Check every finished chunk.** A chunk with a damaged page keeps its good pages, and the hole
   becomes a marked gap. A file with no usable audio moves to `damaged/`.
4. **Rebuild the list** from the log and the chunk files, and paused spans from `session.log` (`pause-resume.md`). Work out gaps from the stamps. A track that
   ends sooner than the other gets a marked gap for the difference.
5. **Seal `chunks.json`** on both tracks.
6. **Update `meeting.json`:** status `recovered` and the real duration. The end point shown to you
   comes from `endNs`.
7. **Remove the log and the lock, then queue the final pass** (decision 6).

Every step can be repeated, so a crash during recovery just restarts it. If both tracks show a clean
`stop`, the crash happened during Stop and no audio is missing, so the meeting ends as `ready`.

### The 6.5 ms chunk issue

**The problem.** Every Opus file starts with a "skip this much" value, because the encoder runs
6.5 ms behind its input. That is correct at the start of a stream. If one continuous stream is cut
into chunks, every chunk still says "skip 6.5 ms" and real speech is thrown away. At 5 s chunks that
is 4.7 seconds an hour per track, or about 37 seconds over 8 hours, in slivers too short to hear
individually. Placing chunks by timestamp stops drift, but it does not bring the audio back.

**What import does today.** `clearPreSkip` sets that value to zero on all chunks but the first. No
samples are lost, but each chunk begins with a decoder that knows nothing about the audio before
it, which can leave a tiny blemish every 5 seconds.

**Options for recordings:**

| | Simple cut (as import) | Fresh start per chunk | Cut with a short overlap |
| --- | --- | --- | --- |
| How | One long encode; skip set to 0 | Encoder restarted each chunk | One long encode; each chunk repeats the previous 80 ms and skips it |
| Samples lost | None | None, if each chunk's end is flushed | None |
| Each 5 s join | Decoder starts cold | Encoder and decoder start cold | Decoder has warmed up |
| Extra disk | None | Small | About 1.6% (under 0.25 MB per track-hour) |
| Code paths | Two | One | Two |

**Recommendation: the overlap.** The Ogg Opus standard (RFC 7845) recommends 80 ms of skip for a
stream cut from a longer one. Every file stays playable alone. Losing a chunk does not harm the next
one. This is still unmeasured: no audio tools are installed on this machine, so measurement M1 comes
before any other chunk code. If the overlap shows no gain, we take the simple cut.

**Applies whichever option is chosen:**

- A chunk that closes for a gap, pause, device change or Stop has no next audio. The encoder must be
  flushed, with the padding trimmed from the end, or the last 6.5 ms is lost at the other end of the
  chunk. The next chunk restarts the encoder with its true skip value.
- The skip value is read from the encoder and scaled to 48 kHz. It is never hard-coded to 6.5 ms.
- The tests compare decoded chunks against the known input, so a wrong skip fails the test.

### Fixes to existing code

These are small, and they are needed for the above. They come after this plan is approved.

| Where | Problem found | Fix |
| --- | --- | --- |
| `importFile.ts` | `chunks.json` and `transcript.final.json` are plain writes, with no flush | Use the safe write; flush the folder after the final rename |
| `importFile.ts` | It needs a folder that does not exist yet, but `Library.createMeeting` makes the folder first. The two cannot be joined, and nothing has joined them yet | Build `meeting.json` in the hidden folder too, so the final rename makes the whole meeting appear at once |
| `importFile.ts` | `sweepAbandonedImports` matches any folder with `.importing-` in its name, and a meeting title can contain that text. Nothing calls it yet, but once wired a title like that would be deleted at start | Match only the exact hidden-folder pattern, and never a folder with a `meeting.json` |
| `readChunkManifest` | No version check, no validation, reads the meeting track only | Use the storage format code; takes a track |
| `audio.ts` `assembleChunks` | Three chunks decode at once, so the winner of an overlap is random. The capture draft says the later chunk wins | Write overlapping chunks in order |
| `library.ts` `createMeeting` | The new folder is not flushed to disk | Flush the parent folder before audio starts |
| `storage` | `removeTempFiles` is safe today (top level only, `.tmp-` names only) | Keep it that way, with a test, since `.part` files hold audio |
| `formats/` | `chunks.json` has no format definition | Add one with `schemaVersion`, and an upgrade from the old form with a test |

### Not in this plan

Pause/resume rules, capture adapters, detection rules, transcript layers and frozen spans, playback,
and index upgrades each have their own plan. Delete gets one rule from here (failure 25).

## How it could lose data, and the test for each failure

Test kinds:

- **I:** integration test with real files.
- **F:** fault injection, killing or breaking the real writer. These feed it invented audio, a
  generated test signal or AMI fixtures, never your real recordings.
- **H:** hands-on run on a machine.

Tests marked "both" run on Windows and macOS.

### Crashes

| # | What could go wrong | How it is handled | Test that proves it |
| --- | --- | --- | --- |
| 1 | Audio worker is killed mid-chunk | `.part` is kept; good pages become a chunk | F, both: force-kill at 1,000 random moments. Decoded audio matches the input up to the marked end, and no more than 1.1 s is lost |
| 2 | Whole app is killed while recording | The worker sees the app has gone, closes both chunks and stops within 2 s (decision 3). Recovery runs at next start | F, both: force-kill the app, confirm the worker exits, no recording continues, and the meeting shows as recovered |
| 3 | Power cut or system crash | Checksums reject torn or garbage data. Only forced-to-disk audio is promised | I: damage the last page at every byte position, with cuts, zeros and garbage. Recovery keeps all good pages and never errors. H, both: one hard power-off during a recording |
| 4 | Crash between writing a chunk and renaming it, or between renaming and logging | Files on disk are the truth. If `.opus` and `.part` both exist, the checked `.opus` is used | I: stop the writer at each step of closing a chunk |
| 5 | Crash during recovery | Every step repeats safely | I: stop recovery after every step, restart, and get the same result byte for byte |
| 6 | Crash during Stop | Log shows `stop` on both tracks, so the status ends as `ready` | I: stop at each Stop step |
| 7 | Crash before any audio is saved | The meeting stays listed as recovered with no audio; nothing is deleted | I |
| 8 | Crash while paused | Audio ends at the pause. No false gap afterwards | F: crash during a pause |
| 9 | A worker is still writing when the app restarts | The lock stops recovery touching its files | F: leave a worker running, start recovery, and confirm no file is touched |
| 10 | Audio worker crashes while the app stays up | Except after `pauseFailed`, which ends the meeting with no restart (`pause-resume.md`), the app restarts it in the same meeting; next chunk numbers follow on; the gap is marked (decision 4) | F, both: kill the worker three times in one recording |
| 11 | The screen (renderer) crashes | Recording carries on, as the worker does not depend on it | F, both: kill the renderer during recording |

### Disk and files

| # | What could go wrong | How it is handled | Test that proves it |
| --- | --- | --- | --- |
| 12 | A cleanup step deletes a `.part` file | Different name from temp files; no cleanup looks inside `audio/` | I: a full reconcile leaves `.part` files byte-identical |
| 13 | Disk fills up | Warning at low space, then a clean stop at the floor (decision 5). A failed write leaves only a torn page | F: a small disk image that fills during recording |
| 14 | Disk stalls for many seconds | The holding buffer absorbs it; overflow becomes a marked gap with cause `disk` | F: delay writes 14 s, then 60 s. Capture never blocks, and the gap matches what was lost |
| 15 | Library drive is removed or becomes read-only | Writing fails, the user is warned, the gap is marked, and audio held in memory is written if the drive returns | F + H: unplug during recording |
| 16 | Windows antivirus briefly blocks a rename | Retries, off the audio path. A stuck `.part` is not lost | F: hold the file open during the rename, on Windows |
| 17 | `chunks.log` is damaged or missing | Rebuilt from the chunk files; close details read "unknown" | I: cut, garble and delete the log |
| 18 | `chunks.json` is damaged | Rebuilt from chunks, never overwritten blindly. A newer version raises an error, as with other formats | I |
| 19 | `meeting.json` is unreadable | Folder is kept and reported, as now; audio untouched | I: already covered in part by storage tests; extend to a recording folder |
| 20 | A chunk in the middle is damaged | Good pages are kept, the hole is marked, and neighbours are unaffected | I: corrupt one chunk in a sequence |

### Audio accuracy

| # | What could go wrong | How it is handled | Test that proves it |
| --- | --- | --- | --- |
| 21 | Samples lost at each chunk (6.5 ms issue) | Writer rule above | I: encode a test signal, decode each chunk alone, and match the input to the sample across 5,760 chunks' worth of joins |
| 22 | Last 6.5 ms lost on a forced close | Encoder is flushed and padding trimmed | I: every close reason in the capture draft |
| 23 | Wrong length at 24 kHz | Skip and duration use 48 kHz units | I: hands-free rate case (F10) |
| 24 | Overlapping chunks land in random order | Later chunk wins, in a fixed order; the earlier chunk stays on disk | I: fixture with a 50 ms overlap |

### Transcript, delete and import

| # | What could go wrong | How it is handled | Test that proves it |
| --- | --- | --- | --- |
| 25 | Delete or auto-delete touches a meeting still being written or recovered | Delete refuses while the lock is held. Auto-delete already skips meetings being made; `recording` status counts | I |
| 26 | Crash during the final pass, or its output is for older chunks | Pass reruns; a mismatch is ignored | F: kill at each phase |
| 27 | Crash between merging `transcript.final.json` and removing it | The merge is recorded, so it never applies twice | I: repeat the merge; corrections stay 100% intact |
| 28 | Import failure or crash leaves a half meeting | The hidden folder is swept. The meeting appears whole or not at all | I: stop at every import step; Gate 3's "leaves nothing behind" still passes |
| 29 | A meeting title contains `.importing-` | The sweep leaves it alone | I |

## Results so far (2026-10-30)

Recovery runs on a real `kill -9`: 7.3 s recorded, chunks repaired, both tracks sealed, repaired chunk decodes, 311 ms lost, within the 1 s limit. A shorter track's tail is marked missing. Damage is truncated at the first bad page, so anything after it in that chunk is lost and marked. Still to run: failures at each step, power-cut simulation, Windows.

## Measurements before building

- **M1, chunk joins:** run the AMI fixtures through all three writers in the table above and compare
  word error rate, speaker error rate, and clicks at joins. This also tests a possible cause of the
  unexplained 3-point word-error loss on ES2004a from saved chunks.
- **M2, forcing to disk:** measure the cost of forcing audio to disk every 5 s against every 1 s, on
  both machines, on battery, during an 8-hour run. On macOS this means the full `F_FULLFSYNC` flush,
  because a plain `fsync` does not reach the drive.

## Gate 2 items this affects

| Gate 2 item | What this plan provides | How it is checked |
| --- | --- | --- |
| 8-hour recording with pauses, a device change and a forced crash loses no saved audio | Chunks, recovery and failures 1 to 8 | 8-hour run on each machine, as in decision 7. Compare chunks with the capture log; every lost span must be marked |
| Stays within the drift target (under 100 ms over 8 hours) | Exact stamps, with one meaning for every chunk (failures 21 to 23) | Capture draft test T1 plus decoded-audio placement; T14 for complete metadata and gap-free numbers |
| Real Teams or Zoom call: start offset and drift from a shared sound | Decoded chunks placed by stamp must line up, so this is measured from saved files | Hands-on, both machines |
| Stopped stream, including an audio-service restart, is detected, with the missing span marked | `gaps` holds the span and cause; the chunk closes cleanly at the last real audio | Capture plan detects it; this plan checks the mark survives Stop and crash |
| Mic audio lost under load, measured against a stated limit, reported apart from sync | Gap causes split stalls from disk loss, so the total comes straight from `chunks.json` | A report from the 8-hour run. The limit itself belongs to the capture plan |

Also affected:

- **Quality targets:** "Lost audio: none, any gap shown" and "Crash recovery: all saved chunks
  recovered, end point marked" are proved by failures 1 to 8. The 200 ms response for Stop and under
  10% recording CPU are rechecked with this writer.
- **Development Plan fault list:** app kill, disk full and device unplugged are covered here.
  Permission loss, sleep/wake and pause during a device change get their tests in the capture and
  pause plans; this plan checks only that their chunks close correctly.
- **Gate 3:** the import changes must keep "a cancelled or failed import leaves nothing behind".

## Build order after approval

1. M1 and M2. Report the results, and settle the chunk option.
2. The `chunks.json` format, import fixes and `assembleChunks` fix. These need no capture code.
3. Recovery, tested against generated chunk folders.
4. The shared chunk writer and its fault tests, which needs the capture plan approved.
5. App-core wiring: start, stop, restart, recovery at launch.
6. The 8-hour runs. Report results against this plan's failure list for merge approval.

## Decisions for the owner

1. **How should chunks join?** Recommended: the short overlap, if M1 shows it helps. It costs about
   1.6% more disk and gives the cleanest joins. If it shows no gain, use the simple cut already in
   import.
2. **How much loss at the very end of a crash is acceptable?** Recommended: about 1 second for a
   program crash and about 5 seconds for a power cut, always marked. Forcing to disk every second
   would shorten the power-cut figure but means more disk activity, so M2 will show whether that is
   worth it.
3. **If the whole app crashes, should recording stop?** Recommended: yes, within 2 seconds. Otherwise
   it would be recording with no visible indicator, which breaks the recording-notice rule. The cost
   is that the rest of the meeting is not recorded until you restart.
4. **If only the audio worker crashes and the app is still up, should it restart by itself?**
   Recommended: yes, in the same meeting with the gap marked, up to 3 times per recording. The app
   is still showing the indicator, and the alternative loses the rest of the meeting. After a third
   restart it would stop and tell you.
5. **What should happen as the disk fills?** Recommended: keep the low-disk warning at 1 GB, and
   stop and save cleanly at 100 MB. The stop leaves room to seal the meeting and write its
   transcript. A full 8 hours takes about 160 to 224 MB for both tracks.
6. **Should a recovered meeting get its final transcript automatically?** Recommended: yes, in the
   background, never while a recording is running. The alternative is a button you must remember to
   press.
7. **What does Gate 2's "forced crash" mean?** The Requirements say a crash ends the recording, so
   a whole-app crash partway through cannot also be an 8-hour recording. Recommended: kill the audio
   worker around hour 4, where the recording carries on (if you accept decision 4), and kill the
   whole app at the end of hour 8 so recovery handles a full-length meeting. "No saved audio lost"
   then means nothing that reached the disk is lost and the end is marked.
8. **Should `transcript.final.json` be kept after it is merged?** Recommended: delete it. Its text is
   already in `transcript.json`, and it holds voice number lists (embeddings) that would otherwise
   outlive a deleted speaker or voice profile.

**Limit to accept, with no choice needed unless you disagree:** the app is built for a local disk.
A network or cloud-synced library folder (OneDrive, iCloud) can hold or move files during writing.
V1 would say so in the User Manual and not detect it. A removed drive is still handled (failure 15).

## Answers this plan gives to open capture-draft questions

Please confirm these with your approval.

- **Q4:** the later chunk wins and the earlier one stays on disk (failure 24).
- **Q14, chunk metadata part:** it stays out of `packages/contracts`, since the UI only needs
  `gaps` and `recoveredEndMs`. Adapter events are left to the capture plan.

## Documents to update after approval

- **Requirements:** "about 30–60 MB per hour per track" is out of date; Gate 0 measured 10 to 14 MB.
- **Development Plan, data rules:** add the kept half-written chunk exception.
- **Development Plan, Phase 3:** "reading saved chunks" no longer matches owner decision 2.
- **`packages/transcription/README.md`:** replace the chunk limit note, and record the result of M1.
