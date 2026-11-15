# Plan: voice preview for speaker profiles and "Split a speaker"

**Status:** draft for owner approval, independent review pending. Plan only, 2026-11-15, written against `main` at `f258188f`. Nothing was run. Owner feedback item 31.

**In plain words**

1. Feasible. A profile stores only a list of numbers, never audio, so a preview is built at play time from the audio of meetings that still exist: a few short single-voice clips, with the words and meeting named beside each.
2. The "Split a speaker" window can play any listed passage, so you can hear who is talking before you move it. That one needs no contract change.
3. The profile preview needs one new read-only call (owner approval). Three slices, about 22 to 28 hours in all.

## What exists today (verified in code)

- **Profile data:** `voice_profiles` holds `embedding` (a float list) and `sample_count`; `voice_profile_meetings` holds only `(profile_id, meeting_id)`. The migration comment says "Number lists only, never audio". There is no clip, no time range and no meeting-speaker link in the profile tables.
- **Link to audio:** each meeting's transcript speaker has `profileId` (contract `Speaker`), and segments carry token times. So "which words in which meeting are this profile" is answerable per meeting, from the transcript, not from the profile.
- **Audio and playback:** the UI plays through `PlaybackEngine` (`ui/lib/playback-engine.ts`) using `seekAudio` and `getPlaybackMedia`. Main returns short-lived `scribe-media:` URLs for sealed chunks, per meeting and track, never paths (`playback-media.ts`). Audio exists only while `audioDeletedAt` is null (auto-delete and the delete-audio option remove it, transcript stays). The microphone track is the user ("You"); other voices are mixed on the meeting track.
- **Speakers screen:** `SpeakersScreen.tsx` lists profiles (rename, merge, delete); `MeetingSpeakers.tsx` has the Split dialog: pick a speaker, tick segments (first 500), enter a new name, then `splitSpeaker` per segment. It has no audio and shows only text.
- Playback is one shared engine, and the sidebar shows a playing indicator for the playing meeting.

## Part 1: profile voice preview

**Which clips.** Computed on demand in main from existing data; nothing new is stored and no audio is copied.

1. Meetings: those in `voice_profile_meetings` whose audio still exists, newest first, at most 3 meetings, so the preview can reveal a mixed-up profile by sounding like different people.
2. In each meeting find speakers whose `profileId` is this profile. Skip meetings where it is ambiguous.
3. In that speaker's segments pick the best one: a segment of 4 to 10 seconds from the meeting track (microphone track for the user's own profile), no other speaker's word overlapping its time range, no pause or gap marker inside, not in the first 30 seconds. Prefer more words and fewer corrected or low-confidence words. Deterministic: same input gives the same clip, so Play twice sounds the same.
4. If a meeting yields none, skip it. If no clip qualifies anywhere, show "No audio available to preview" with the reason (audio deleted, or no clear passage).

**What the user sees.** On each profile row a **Play sample** button. It plays up to 3 clips back to back (up to 30 seconds in all); under the row, a line per clip: meeting title and date, and the words spoken, each with its own small play button. Pause and stop. Playing a new one stops the old.

**Contract.** One new read-only call, `getProfileClips: { request: { profileId }; response: { clips: Array<{ meetingId; meetingTitle; date; startMs; endMs; track; text }> } }` (add to `CALL_TABLE` and `validate.ts`). No path, no URL, no audio bytes. Audio itself comes through the existing `getPlaybackMedia` for that meeting and time. Needs owner approval.

**Stopping at the clip end (audio-thread bound, with an honest fallback).** A JavaScript timer or `timeupdate` callback can be throttled or suspended, so polling `currentTime` is **not** a hard stop and this plan does not rely on it for the boundary. The boundary is enforced by the audio engine: the clip's media element is routed through Web Audio (`MediaElementAudioSourceNode` into a `GainNode`), and when playback actually starts (the element's `playing` event) the player schedules `gain.setValueAtTime(0, audioContext.currentTime + durationSec)` on the audio clock, with a 30 ms ramp before it. Silence then happens on the audio thread even if the page is busy or throttled. Callbacks (`timeupdate`, a 50 ms check, a fallback timer just after `endMs`, `ended`) still pause and release the element, but only to free resources, not to bound what is heard. Two things the slice 1 spike must prove before this is accepted: (1) the `scribe-media:` element is CORS-same-origin so Web Audio does not output silence (it may need a `crossorigin` attribute and the media handler's CORS headers, a small change to main's media scheme and therefore its own review); (2) the start-event latency stays small. If (1) cannot be done safely, the fallback is stated plainly: the stop is then by callbacks only, and **no overshoot bound is promised**; to limit harm the preview pauses on window blur, minimise, `visibilitychange`, tab or screen change, and the audio it could run on to is only the same meeting's own audio played to the owner on their own machine (nothing is sent anywhere). The plan then returns to the owner before slice 3.

**Playback reuse.** Use the shared `PlaybackEngine`: seek to `startMs`, play, stop at `endMs` by the audio-thread bound above. Side effect to accept or avoid: it moves the meeting's saved playback position and lights the sidebar "playing" indicator. Slice 1 starts with a spike to decide between reusing the engine and a small separate clip player over the same `getPlaybackMedia` URLs (preferred if the position side effect is unwanted); no main or contract change either way.

**Privacy.** No prompt, log or request ever carries a voice clip, and nothing new is stored or sent; any listening to the owner's real meetings is done by the owner only, never by an agent. Clips come only from audio the owner already keeps, play only inside the app through the existing grant-checked media scheme, and a deleted-audio meeting contributes nothing. The profile's number list is never exposed. The preview does not feed the matcher.

## Part 2: audio preview in "Split a speaker"

- Each passage row gets a play button. It plays that segment's time range (a small lead-in of 0.5 s), on the meeting's own tracks, using the same engine and clip player. The meeting id, segment and times are already in the dialog's state, so **no contract change**.
- A **Play all ticked** button plays the ticked passages in order, so the user hears what will move. Stops at the end or on Close.
- If audio was deleted: buttons disabled with "Audio isn't saved for this meeting".
- Overlapping speech: the preview plays both tracks as the Audio tab does; the row notes "overlaps with another voice" when the transcript says so (text only, no new data).

## Tests

- Clip chooser (main, pure): invented transcripts for overlap exclusion, pause markers, length bounds, ambiguous speaker, deleted audio, three-meeting cap, determinism; user profile uses the microphone track.
- Contract: `getProfileClips` in `contract.test.ts`, `ipc.test.ts`, `validate.test.ts`; request has no path.
- Clip stop (fake media element and fake audio context with controllable clocks): the gain cut is scheduled at start plus the clip length on the audio clock; with every JS callback delayed or never delivered, the scheduled cut still occurs and the test asserts the cut time, not callback timing; a late `playing` event shifts the cut by that delay and no more; stops once when the callbacks and the cut both fire; a clip crossing a chunk boundary is cut in the right chunk; Pause, Close, tab change, blur and switching clips cut at once; audio deleted during playback stops the clip and shows the no-audio state. No test asserts a callback-based overshoot bound.
- UI on the mock: Play sample starts and stops, per-clip play, no-audio state, Split dialog play and Play all, stop on close. Mock returns fixed clips and must match the contract.
- Manual, about 10 minutes on the owner's Mac with their own meetings (never read or committed by an agent): listen to three profiles, one known good, one merged by mistake. Not expected to exceed 20 minutes.

## Slices (one PR each)

1. **Split dialog preview** and the clip-player spike. UI only. 6 to 8 hours.
2. **`getProfileClips`**: chooser in main with tests, contract and mock. Needs approval. 8 to 10 hours.
3. **Profile Play sample UI**, clip list, no-audio states. 6 to 8 hours.

## Owner decisions

1. Approve the read-only `getProfileClips` call. **Recorded 2026-11-15:** approved for implementation after independent review of this plan; relayed by the planning session from the owner's chat decision, so the owner should confirm it on this PR.
2. Clip count and length: 3 clips from different meetings, 4 to 10 s each (recommended), or one clip?
3. May a preview move the meeting's saved playback position and light the sidebar indicator (reuse of the shared engine), or must it stay separate (a few more hours)?
4. Profile previews only from meetings whose audio still exists: acceptable (the only possibility, since profiles hold no audio)?

## Risks

- A profile whose meetings all lost their audio has no preview. Storing a clip per profile would change the "never audio" rule; this plan does not.
- Final-pass speaker labels can be wrong; the preview shows exactly what the app currently believes, which is the point.
