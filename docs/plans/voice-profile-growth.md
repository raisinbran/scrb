# Voice profile growth from corrections (plan, draft)

Status: draft, revised after independent review; owner decisions a to e approved 2026-11-25. Docs only; no code in this PR.

**Goal.** When the owner names or fixes a speaker in a finished meeting, the app learns that voice, so later meetings are grouped and named correctly with no extra work.

## What is missing today (verified in code, 2026-11-13, `main` at d1789d19)

1. **Nothing ever creates or grows a profile.** `VoiceProfileStore.create` and `.grow` (`packages/storage/src/db/voice-profiles.ts`) have no production caller. `profileChanges`/`growProfile` in `packages/transcription/src/profiles.ts` are also unused outside tests. So `startProfileMatching` (`packages/app-core/src/profile-matching.ts`) always sees an empty profile list. Only rename, merge, delete and undo of existing profiles are wired (PR #156).
2. **Voices are not kept after the final pass.** Per-speaker embeddings exist only in the in-memory `FinalTranscript`; the transcript file has no embedding field and the work dir is deleted (`final-pass.ts`, `process`). A later correction has nothing to learn from.
3. **Recordings never opt in.** `createMeeting` defaults `buildVoiceProfiles` to `false` and `recording.ts:248` does not pass it; only imports pass the user's choice. Requirements say profiles are built silently from recordings.
4. **Suggestions are empty.** `listSpeakerSuggestions` returns `[]` (`main/meetings.ts:464`); there is no `answerSpeakerSuggestion` handler in `apps/desktop/src/main/` at all. The matcher computes `suggest` results (0.45 to 0.60) and throws them away (`if (match.kind !== 'auto') continue`).
5. Renaming a meeting speaker only sets `name` and `userNamed` in the transcript (`corrections.renameSpeaker`); no profile is touched. Matching already skips `userNamed`, merged and overridden speakers, so owner edits are protected.

## Owner decisions (approved 2026-11-25)

- **(a)** New recordings default `buildVoiceProfiles` to true, as a separate final one-line PR after every removal path has merged.
- **(b)** The silent-grow gate is a named constant `silentGrowCosine = 0.55`; below it a rename creates a second profile.
- **(c)** `voices.json` holds every speaker's embedding, including never-named voices. Audio-only auto-delete also deletes `voices.json` and drops that meeting's contributions.
- **(d)** A rename creates or grows a profile only from a speaker with at least 8 embedding segments (`minProfileSegments`).
- **(e)** Auto matches never grow a profile; only hand-set names teach.

Live-pass renames made before the final pass finishes never learn (accepted): `voices.json` does not exist yet.

## Smallest design

**Keep the voice.** At the end of a final pass, if `meeting.buildVoiceProfiles` is true, write `voices.json` in the meeting folder: per speaker id, Float32 embedding (base64), segment count, model id (approved model only). Same permissions as other meeting files (0600 on POSIX, via the atomic writer). Not copied by export or backup. Deleted with the meeting folder, by audio-only auto-delete, and by any manual delete-audio path, each also dropping that meeting's contributions. A final-pass reprocess replaces `voices.json` (speaker ids change); reconcile (below) repairs contributions afterwards.

**Contributions.** Migration 6 to 7 (`MIGRATIONS` has six steps today) adds `embedding BLOB` (Float32 little-endian, same format as `voice_profiles.embedding`), `sample_count INTEGER` and `model_id TEXT` to `voice_profile_meetings`. Contributions are the source of truth: a profile's embedding is the segment-weighted mean of its contributions and `sample_count` their sum, both recomputed after every change, one contribution per (profile, meeting). No production profile exists yet (finding 1), so no backfill; a link lacking a contribution is never recomputed, only unlinked.

**Zero contributions.** Removing a profile's last contribution (rename away, transcript undo, meeting delete) deletes the profile, unless it was hand-renamed on the Speakers screen (`rename()` marks it kept).

**Store operations** (all in `VoiceProfileStore`, verified against code: `merge` uses `link()` which is `INSERT OR IGNORE` and carries no embedding or count; `restore()` re-inserts without the new columns; `ON DELETE CASCADE` drops contribution rows):
- `merge(from, into)` moves contribution rows; a meeting present in both is combined by segment-weighted mean. Then recompute.
- `ProfileChange` snapshots and `restore()` carry the contribution columns, so undo and redo return exact contributions. `delete` removes its contributions by cascade (intended).

**Reconcile.** One function, `reconcileContributions(meetingId)`, runs after every transcript commit in `library.changeTranscript` (so undo, redo, merge, split, reassign and reprocess are all covered with no per-path hooks), and after final-pass reprocess. It derives the desired contributions from the transcript: speakers with `userNamed`, `profileId` set, not merged, not split/overridden, and present in `voices.json` with the approved model id; then adds, replaces or removes this meeting's rows and recomputes affected profiles. It runs under the existing `voice-profile-assignments` lock, so a rename-learn during another meeting's matching job cannot make `assignSpeakerProfiles`' `beforeSave` throw `Profile changed` (it would otherwise: the snapshot comparison at `library.ts` ~833 fails when a profile is grown meanwhile; the matching job retries or skips on that conflict).

**Learning rule** (new `packages/app-core/src/profile-learning.ts`, called from the real `renameSpeaker` handler). For a hand-renamed speaker S with name N (trimmed). Ignore empty names, default labels (`Speaker N`) and `You`.

| Case | Action |
| --- | --- |
| No `voices.json`, wrong model id, fewer than 8 segments, overrides, split | Do nothing (no learning) |
| S is linked to profile P (auto or earlier hand link) and N differs from P's name | Unlink: clear `speaker.profileId` in the same edit, remove the contribution. P is not renamed. Then continue below |
| Named profile(s) with the same name (case-insensitive) exist: take the highest cosine; if it is >= `silentGrowCosine` | Add S's contribution to that profile, set `speaker.profileId` |
| Same-name profile exists but best cosine < 0.55 | Create a second profile with that name (merge on the Speakers screen) |
| No same-name profile | Create profile N from S, set `speaker.profileId` |

Link and create set `speaker.profileId` and append to `voice_profile_meetings` in the same transcript edit, so the matcher's exclusion (`profile.meetingIds.includes(meetingId)`) holds.

**Commit order and crash behaviour.** Transcript edit first, then store write, then reconcile. A crash after the transcript commit leaves a speaker with `profileId` but no contribution; the next commit in that meeting reconciles it (or it learns nothing, never wrongly). A crash before it loses only the edit.

**Matcher snapshot.** `startProfileMatching` (`profile-matching.ts` lines 41-49) currently keeps only profiles with `sampleCount >= 8`, so thin profiles never even suggest. Change: keep every named, approved-model profile; `matchVoices` already returns `suggest` for a thin profile; add an explicit `sampleCount >= 8` check on the `auto` branch. `suggest` matches are collected and written to `suggestions.json`.

**Silent versus asking.**
- Silent: anything the owner explicitly did (typing a name; accepting a suggestion). Auto matches at >= 0.60 by a profile with >= 8 segments, as today.
- Ask (suggestion): matches between 0.45 and 0.60, and matches to thin profiles. Stored in `suggestions.json` (speaker id, profile id, score, status; no voice data) and emitted as the existing `speakerSuggestion` event. `listSpeakerSuggestions` reads it, dropping speakers already named or merged and profiles that no longer exist. `answerSpeakerSuggestion` accept = same as a rename to the profile's name (a hand-set name, so it learns); decline = status `declined`, never asked again for that speaker. `suggestions.json` is rewritten or invalidated on reprocess and on profile delete or merge.
- Never learn from auto matches (decision e). Split, reassign and merge of a learned speaker remove or recompute its contribution through reconcile (a two-person mean after an over-merge then split must not remain); they never add one.

**Privacy and deletion.** Imports keep the default of no building and no `voices.json`; existing profiles may still suggest and assign. `deleteProfile` removes its contributions; the `voices.json` entry of linked speakers stays (it is the meeting's own voice data and renaming later can rebuild), and reconcile unlinks those speakers. Embeddings stay on this computer, never in logs, exports or transcript text. Rebuild after a profile model change is out of scope; `voices.json` makes it possible later.

## Contract

**No `packages/contracts/` change is needed, so no handoff note.** `SpeakerSuggestion`, `answerSpeakerSuggestion`, `listSpeakerSuggestions`, the `speakerSuggestion` event and `renameSpeaker` already carry everything. Profile growth is a side effect, not a new call. Profile growth is not in the profile undo stack (the contract limits `ProfileUndoState` to `rename`/`merge`); it is reversed through transcript undo (reconcile, slice 2a) or Delete. **UI change (no contract change):** `SpeakerSuggestionsProvider` in `apps/desktop/src/ui/components/speakers/SpeakerSuggestions.tsx` only listens for the `speakerSuggestion` event, so suggestions vanish after a restart or if they arrive while nothing listens (its comment wrongly says the contract has no list call). It must also load stored suggestions through the existing `listSpeakerSuggestions` on mount and when a meeting opens, merge them with event arrivals, and test that. `hybrid-backend.ts` already routes both suggestion calls by meeting, so they go real as soon as the handlers exist. It must also cover restart and no-meeting-open (suggestions still listed).

## Tests (invented data; AMI optional)

Synthetic unit vectors with set cosines, no recordings. Storage: migration 6 to 7, contribution add/remove/recompute, profile merge then undo and redo, same-meeting double contribution, last contribution removed deletes profile (and hand-renamed profile survives), delete purges. App-core decision table (every row, 0.55 and 8-segment gates, highest cosine among same-name profiles, empty/default/`You` names, model-id mismatch skips learning). Reconcile: rename A to B to A; rename then transcript undo then redo; rename then split; reprocess after learning; crash between transcript commit and store write; concurrent rename-learn during a matching job. Handler tests use the real library, not a fake: rename learns, rename-away unlinks and clears `profileId`, accept/decline, no `voices.json` when the flag is off, audio-only auto-delete purges `voices.json` and contributions. One optional AMI ES2004 replay to confirm two meetings of one speaker group together. `npm run check` throughout.

## Risks

- **Mislabel pollution** (wrong name on a stranger): bounded by the 0.55 same-name gate, the 8-segment minimum and removable contributions; Delete is the escape.
- **Thresholds** were measured on one embedding model and AMI, not this owner's rooms; expect more suggestions than auto-names at first.
- **One person split into two speakers** in a meeting: both contribute to one profile (one combined contribution); different people with one name get two profiles until merged.
- **Recording default flip** collects voice data by default (decision a); relies on the banner.
- **Voice data for never-named voices** (decision c) is kept per meeting until the meeting or its audio is deleted.

## Slice order

1. **Storage:** migration 6 to 7, contribution add/remove/recompute, merge, undo and redo carrying contributions, delete-by-zero rule, `voices.json` read/write/purge, tests. No behaviour change.
2. **2a, removal paths first:** write `voices.json` after the final pass (build flag on, exercised via imports); `reconcileContributions` in `changeTranscript` and reprocess; meeting delete, auto-delete and delete-audio purges; `deleteProfile`; split/reassign/merge cleanup via reconcile; tests for each path.
3. **2b, the learning rule** in `renameSpeaker` (create, grow, unlink), with its tests.
4. **Suggestions (backend):** matcher snapshot change, persist `suggest` results, real `listSpeakerSuggestions` and `answerSpeakerSuggestion`, event.
5. **Suggestions (UI, no contract change):** `SpeakerSuggestionsProvider` loads stored suggestions on mount and meeting open; tests include restart and no-meeting-open.
6. **Merge of a learned speaker's mean** (replace the meeting contribution with the segment-weighted mean of both speakers).
7. **Recording default:** a separate one-line PR setting `buildVoiceProfiles: true` in `recording.ts`, merged last.

Each slice is one PR (slice 5 is UI-side, per the folder boundary) with independent review before merge.
