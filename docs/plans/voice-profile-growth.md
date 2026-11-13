# Voice profile growth from corrections (plan, draft)

Status: draft, independent ChatGPT review **pending**. Docs only; no code in this PR.

**Goal.** When the owner names or fixes a speaker in a finished meeting, the app learns that voice, so later meetings are grouped and named correctly with no extra work.

## What is missing today (verified in code, 2026-11-13, `main` at aafef2c)

1. **Nothing ever creates or grows a profile.** `VoiceProfileStore.create` and `.grow` (`packages/storage/src/db/voice-profiles.ts`) have no production caller. `profileChanges`/`growProfile` in `packages/transcription/src/profiles.ts` are also unused outside tests. So `startProfileMatching` (`packages/app-core/src/profile-matching.ts`) always sees an empty profile list. Only rename, merge, delete and undo of existing profiles are wired (PR #156).
2. **Voices are not kept after the final pass.** Per-speaker embeddings exist only in the in-memory `FinalTranscript`; the transcript file has no embedding field and the work dir is deleted (`final-pass.ts`, `process`). A later correction has nothing to learn from.
3. **Recordings never opt in.** `createMeeting` defaults `buildVoiceProfiles` to `false` and `recording.ts:248` does not pass it; only imports pass the user's choice. Requirements say profiles are built silently from recordings.
4. **Suggestions are empty.** `listSpeakerSuggestions` returns `[]` (`main/meetings.ts:464`); there is no `answerSpeakerSuggestion` handler in `apps/desktop/src/main/` at all. The matcher computes `suggest` results (0.45 to 0.60) and throws them away (`if (match.kind !== 'auto') continue`).
5. Renaming a meeting speaker only sets `name` and `userNamed` in the transcript (`corrections.renameSpeaker`); no profile is touched. Matching already skips `userNamed`, merged and overridden speakers, so owner edits are protected.

## Smallest design

**Keep the voice.** At the end of a final pass, if `meeting.buildVoiceProfiles` is true, write `voices.json` in the meeting folder: per speaker id, embedding, segment count, model id (approved model only). Not written when the flag is off. It is deleted with the meeting folder.

**Contributions.** Add nullable `embedding` and `sample_count` columns to `voice_profile_meetings` (migration). A profile's embedding is the segment-weighted mean of its contributions; one contribution per (profile, meeting). Removing a contribution (rename away, transcript undo, meeting delete) recomputes the profile, so a mistake or a deleted meeting does not leave its voice behind. No production profile exists yet (finding 1), so no backfill; a profile with any link lacking a contribution is never recomputed, only unlinked.

**Learning rule** (new `packages/app-core/src/profile-learning.ts`, called from the real `renameSpeaker` handler after the transcript edit succeeds). For a renamed meeting speaker S with name N:

| Case | Action |
| --- | --- |
| Meeting has no voices file, speaker is "You", has overrides, was split, or model is not approved | Do nothing |
| S was auto-matched to profile P and N differs from P's name | Unlink S from P (remove its contribution), then continue as below. P is not renamed |
| A named profile P with the same name (case-insensitive, trimmed) exists and cosine(S, P) >= 0.45 | Add S's contribution to P (silent grow), link S to P |
| Same-name profile exists but cosine < 0.45 | Create a second profile with that name (merge on the Speakers screen); never pollute P |
| No same-name profile | Create profile N from S, link S |

A profile with fewer than 8 segments never auto-names (`minProfileSegments`), so a first-meeting profile cannot auto-name a stranger. Today `startProfileMatching` drops such profiles in its snapshot (`sampleCount >= 8`, `profile-matching.ts` lines 41-49), so thin profiles would never even suggest. Change: the snapshot keeps every named, approved-model profile; the 8-segment rule for automatic naming stays, enforced by `matchVoices` itself (it already returns `suggest`, not `auto`, for a thin profile) plus an explicit `sampleCount >= 8` check on the `auto` branch before assignment. Matches of kind `suggest` are collected separately and written to `suggestions.json`.

**Silent versus asking.**
- Silent: anything the owner explicitly did (typing a name; accepting a suggestion). Auto matches at >= 0.60 by a profile with >= 8 segments, as today.
- Ask (suggestion): matches between 0.45 and 0.60, and matches to thin profiles. The final-pass matcher stores them in `suggestions.json` in the meeting folder (speaker id, profile id, score, status; no voice data) and emits the existing `speakerSuggestion` event. `listSpeakerSuggestions` reads it, dropping speakers already named or merged and profiles that no longer exist. `answerSpeakerSuggestion` accept = same as a rename to the profile's name (link, silent grow); decline = status `declined`, never asked again for that speaker.
- Never learn: auto matches never grow a profile by themselves (a wrong auto match must not reinforce itself); only an owner action does. Word-level `reassignSpeaker` and `splitSpeaker` never grow (an embedding is per speaker, not per word) and mark the speakers as not learnable in that meeting. Unnamed profiles are not built for every voice (a deliberate narrowing of the requirement wording: they cannot auto-name anyone, and naming later builds the profile from `voices.json`).
- Merging two meeting speakers where one is profile-linked: replace that meeting's contribution with the segment-weighted mean of the two; if they link to different profiles, do nothing.

**Privacy and deletion.**
- Imports keep their default of no building and no `voices.json`; existing profiles may still suggest and assign (requirements, import section).
- Recordings: set `buildVoiceProfiles: true` at `createMeeting` in `recording.ts`. This is the behaviour requirement 139 already describes and the privacy banner already covers; the owner should confirm it.
- `deleteProfile` also removes that profile's contributions and the `voices.json` entries of speakers linked to it (the scan in `unlinkVoiceProfile` already visits those meetings). Meeting delete and auto-delete remove `voices.json` with the folder and the meeting's contributions, then recompute. Embeddings stay on this computer, never in logs, exports or transcript text.
- Learning from the profile model change (requirements line 294, rebuild from stored meetings) is out of scope here; `voices.json` makes it possible later.

## Contract

**No `packages/contracts/` change is needed, so no handoff note.** `SpeakerSuggestion`, `answerSpeakerSuggestion`, `listSpeakerSuggestions`, the `speakerSuggestion` event and `renameSpeaker` already carry everything. Profile growth is a side effect, not a new call. Profile growth is not in the profile undo stack (the contract limits `ProfileUndoState` to `rename`/`merge`); it is reversed through transcript undo (slice 2) or Delete. **UI change (no contract change):** `SpeakerSuggestionsProvider` in `apps/desktop/src/ui/components/speakers/SpeakerSuggestions.tsx` only listens for the `speakerSuggestion` event, so suggestions vanish after a restart or if they arrive while nothing listens (its comment wrongly says the contract has no list call). It must also load stored suggestions through the existing `listSpeakerSuggestions` on mount and when a meeting opens, merge them with event arrivals, and test that. `hybrid-backend.ts` already routes both suggestion calls by meeting, so they go real as soon as the handlers exist.

## Tests (invented data; AMI optional)

Synthetic unit vectors with set cosines, no recordings. Storage: migration, contribution add/remove/recompute, delete purges. App-core decision table (every row above, including the two thresholds and the thin-profile case). Handler tests with a fake library: rename learns, rename-away unlinks, accept/decline, no `voices.json` when the flag is off, `deleteProfile` purges. One optional AMI ES2004 replay (existing script) to confirm two meetings of one speaker group together; short, no long-test approval needed. `npm run check` throughout.

## Risks

- **Mislabel pollution** (owner names the wrong speaker): bounded by the 0.45 same-name check and by removable contributions, but a typo-free wrong name on a stranger still creates a bad profile; Delete is the escape.
- **Thresholds** were measured on one embedding model and on AMI, not on this owner's rooms or microphones; expect more suggestions than auto-names at first.
- **One person split into two speakers** in a meeting: both contribute to one profile (merged into one contribution); different people with one name get two profiles until merged.
- **Recording default flip** collects voice data by default; relies on the banner and owner confirmation.
- **Crash between final pass and `voices.json`** loses only that meeting's learning.

## Slice order

1. **Storage:** migration, contribution add/remove/recompute, `voices.json` read/write/purge, tests. No behaviour change (nothing writes voices yet).
2. **First teaching path, with every safeguard in the same slice** (no voice data is saved before it can be removed): write `voices.json` after the final pass; recordings opt in; `profile-learning` hooked into `renameSpeaker` (create/grow/unlink); `deleteProfile` removes the profile's contributions and linked `voices.json` entries; transcript undo/redo removes or restores the meeting's contribution; meeting delete and auto-delete remove its contributions (then recompute). Tests cover each removal path.
3. **Suggestions (backend):** thin-profile snapshot change, persist matcher `suggest` results, real `listSpeakerSuggestions` and `answerSpeakerSuggestion`, event.
4. **Suggestions (UI, no contract change):** `SpeakerSuggestionsProvider` loads stored suggestions on mount and on meeting open; test with a restart.
5. **Merge sync:** merging meeting speakers updates the meeting's contribution.

Each slice is one PR (slice 4 is UI-side, per the folder boundary) with independent review before merge.
