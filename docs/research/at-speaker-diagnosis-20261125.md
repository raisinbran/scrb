# Speaker attribution, Split dialog conflict and voice profiles on the 261124 AT meeting (2026-11-25)

Diagnosis only. Measured on a copy of the owner's meeting in a temporary library; the original was not opened for writing. Numbers only: no transcript text, names, audio or excerpts. Speakers are called S1 to S5 by size, raw diarization clusters by their sherpa number. "Moved voice" means the second person the owner moved out of S1 by hand.

## 1. Misattribution: the final-pass relabel merged two voices

Every segment in the saved transcript is `pass: final`, so live diarization did not decide the labels. Profile matching did not either: the library holds 0 voice profiles and no speaker has a `profileId`.

Re-running the final pass's diarization and embedding on the copy (same models, same thresholds) reproduced the mechanism, not an exact historical replay (28 raw clusters here, 25 in the app log, 5 final speakers either way; S1 and S2 were 1085 s and 910 s here, 1069 s and 910 s in the log).

| Measure                                                              | Value                                      |
| -------------------------------------------------------------------- | ------------------------------------------ |
| Raw cluster holding the moved voice                                  | one cluster, 507 s, 128 embedded spans     |
| Spans in that cluster at 0.70 or more to the moved voice             | 99 of 128 (3 below 0.40)                   |
| Same cluster against the largest raw cluster (726 s)                 | 0.39                                       |
| Moved voice against the S1 centroid                                  | 0.77 to 0.84 on 8 of 10 owner-moved ranges |
| S1 spans, 2-means split                                              | 106 and 134 spans, centroids 0.66 apart    |
| Raw cluster 16 (moved voice) against raw 5 (311 s) and raw 6 (181 s) | 0.66 and 0.61                              |
| Raw 5 against raw 6                                                  | 0.90                                       |

Sherpa kept the moved voice as its own clean cluster. The relabel then merged it with two other raw clusters because 0.66 is above `mergeLine` 0.65 (`packages/transcription/src/speakers.ts`, `RELABEL_DEFAULTS`). This is over-merge in the relabel stage, not wrong-cluster assignment by diarization.

Counterfactual on the same embeddings: `mergeLine` 0.70, 0.75 and 0.80 all give the moved voice its own 507 s speaker and leave the other four groupings unchanged. The comment on the constant says 0.60 to 0.70 gave the same result on three AMI meetings, so 0.70 is inside the measured band but this meeting is the only evidence at 0.70 so far.

## 2. "The selected speaker or text changed." is an overlap refusal, not a stale revision

That exact text is only returned by `reassignSpeaker` (`apps/desktop/src/main/meetings.ts`, around line 560). Split sends the first ticked passage through `splitSpeaker` (message "The selected text changed.") and every later passage through `reassignSpeaker`, so the error appears on the second or later tick.

Reproduced headlessly on the copy by doing what the dialog does (split the first segment, reassign the rest, whole-segment word ids):

| Speaker             | Segments | Reassigns refused |
| ------------------- | -------- | ----------------- |
| S1                  | 75       | 5                 |
| S2                  | 65       | 1                 |
| S3, S4, mic speaker | 24, 8, 3 | 0                 |

The reproduction printed 5 refused of 75 for S1 and 1 of 65 for S2. Every refusal was `CorrectionConflictError('The selected words overlap other speech.')` from `assertSpeakerOverrideSelection` (`packages/storage/src/corrections.ts`). Overrides are stored as a time range on a track, and the check refuses any range that would also move a word outside the selection. The copy has 12 adjacent segment pairs on the meeting track whose time ranges overlap, so ticking one of them would drag in words from a neighbour. The overlap refusal is credible for this reproduction; it is not proof that every dialog conflict is an overlap, because the same generic message covers other conflicts. It is not a stale revision (the dialog passes no revision to `reassignSpeaker`, and `before` is read fresh) and not old word ids (a stale id would raise the different "Selection changed. Select the text again."). The dialog builds ids from whole segments with `rangeOf`, which is correct for what it shows.

Consequence: in a meeting with overlapping segments the dialog cannot finish. It moves the earlier ticks and then stops, and `moved` keeps them on retry, so a second click hits the same refused passage again. The saved transcript already shows this partial result: the split speaker carries 10 overrides (1 split plus 9 reassigns) and 18 undo entries.

## 3. Voice profiles

- Naming a speaker by hand renames the speaker in the transcript only (`renameSpeaker`). It does not create or update a profile. `voiceProfiles.create` and `voiceProfiles.grow` have no production caller (only an e2e fixture and `merge`). This is already recorded in `docs/handoffs/v1-status-and-independent-slices-20261117.md`.
- The copy's library has 0 rows in `voice_profiles` and `voice_profile_meetings`. The meeting has `buildVoiceProfiles: false`, which is the default for recordings.
- So there is nothing to match against, whatever the thresholds. Even with profiles, matching skips speakers the user named (`userNamed`), speakers with overrides, merged speakers, and the "you" speaker, and needs `sampleCount >= 8`, a name, and 0.60 for an auto-assign (`packages/app-core/src/profile-matching.ts`).
- `matchVoices` computes `suggest` matches (0.45 to 0.60) but `startProfileMatching` only keeps `auto`; suggestions are discarded, not stored, and no meeting-view UI shows them.

## Recommended smallest fixes

1. **Merge line.** Do not change 0.65 without reviewed paired AMI evidence. Since this note was written, PR #504 merged 0.70 with AMI showing identical results from 0.60 to 0.75, so AMI neither supports nor argues against the move; this meeting is the only evidence that favours 0.70.
2. **Split dialog.** Any skip behaviour must name the overlap as the cause (the generic conflict can mean other failures), show the passages that were not applied, and keep undo. Do not treat overlapping ranges as permission to move words the user did not select. A word-id override or segment-only snapping would touch storage and probably the contract (owner approval).
3. **Profiles.** Implement the growth plan (`docs/plans/voice-profile-growth.md`): create or grow a profile when a speaker is named, and store suggestions so the meeting view can show "possibly X". Growth must respect `buildVoiceProfiles` and privacy consent. Not a bug fix; larger than a small change.

No code was changed.
