> **Status note (2026-11-12, added when filed):** this is ChatGPT's reviewed plan text as revised before implementation. Steps 1 to 4 of section 9 shipped in PR #98 (merged). The threshold rule in section 2 was superseded by the owner-approved v3 rule: optimal one-to-one assignment by meeting-track word-interval overlap; transfer `name` and `userNamed` only if shared speech is at least 10 s, at least 70% of the live speaker's speech, and the live-side margin is at least 20 points; no competing-edge rule; otherwise keep the original record and set `needsManualResolution`. Section 9 step 5 (integration verification) is the only open item.

Chatgpt:


Revised plan for `docs/plans/live-multi-speaker-diarization-slice2b.md`.

The revisions follow the seven requested changes. I also checked the relevant implementation paths at `cb82b13`. The exact ES2004a evidence subdirectory could not be verified, so the calibration section includes a read-only discovery step rather than inventing a file path.

# Live Multi-Speaker Diarization — Slice 2b Implementation Plan

**Status:** Plan only. Independent plan review completed; owner approval of the two identified decisions is pending.\
**Base:** `main` at `cb82b13`, November 11, 2026. PRs #96 and #97 merged.\
**Scope:** Slice 2b items 2 and 3 of `docs/plans/live-multi-speaker-diarization-slice2.md`: conservative live-to-final name transfer, history preservation, ambiguity handling, and safe final IDs.

No implementation, tests, sound, or repository changes were performed for this revision.

## 1. Live-to-final shutdown: retain existing implementation

**No production change planned.**

The existing sequence already provides the necessary ordering:

- `apps/desktop/src/main/recording.ts:178–211`, `RecordingController.finish`, awaits `live.stop()` before enqueuing the final pass.
- `apps/desktop/src/main/live-feed.ts:203–205,239–260` rejects callbacks from closed or superseded helpers.
- `apps/desktop/src/main/live-transcript.ts:201–268` reads the transcript, checks for an existing final segment, and writes against the revision it read.
- `LiveTranscriptSink.stop()` awaits the active drain and then clears pending events. Discarding remaining provisional model output is acceptable because the final pass replaces that layer.

Do **not** add worker-generation serialization, storage-level live-write guards, or a replacement drain mechanism.

**One regression:** Use a deterministic fake worker in the existing live-transcript/recording test harness. Verify Stop completes before final replacement begins, then deliver a late event from the closed worker and assert the final transcript, revision, and speaker ownership remain unchanged.

## 2. Conservative live-to-final name transfer

**Primary change:** `packages/storage/src/corrections.ts`, `mapSpeakers`.

Replace the current maximum-segment-overlap rule with a same-track, word-interval overlap matrix.

For each resolved live speaker L and final speaker F:

1. Resolve live aliases using `resolveSpeakerId`.
2. Use meeting-track word intervals only; exclude microphone speech and the generic `meeting` fallback.
3. Divide speech time into 10 ms bins. Count each bin once per active speaker pair, avoiding double-counting overlapping words.
4. Calculate shared speech, coverage in both directions, and the margin over competing candidates.

**Proposed acceptance thresholds — uncalibrated:**

| Criterion                 | Requirement                                     |
| ------------------------- | ----------------------------------------------- |
| Shared speech             | ≥10 seconds                                     |
| Live speaker coverage     | ≥70%                                            |
| Final speaker coverage    | ≥70%                                            |
| Winner over runner-up     | ≥20 percentage points in both directions        |
| Competing structural edge | ≥5 seconds and ≥15% coverage of either endpoint |
| Competing user-named edge | ≥5 seconds and ≥10% coverage of either endpoint |

Transfer only when the pair is mutually unique, satisfies every acceptance criterion, and has no disqualifying competing edge. A one-to-many or many-to-one candidate component remains unresolved.

**Transfer only `name` and `userNamed`** from a user-named live speaker. Do not transfer `profileId`. The live sink initializes profile links to `null`; no production user-assignment path was verified. Existing automatic profile matching runs after the final pass and remains unchanged.

On ambiguity:

- Preserve each original user-named live speaker record, including its ID and existing metadata, without aliasing it to a final speaker.
- Mark that record and implicated final candidates for manual review.
- Keep all distinct final speakers distinct.

**Remove the current `mapSpeakers` behavior that assigns `mergedInto` to a losing final speaker.** It can silently make two genuinely distinct final speakers appear to be one. In particular, if one named live speaker overlaps two final speakers, neither final speaker is automatically merged into the other.

Retain frozen corrections, manually applied overrides, and the existing `verifyCorrectionsIntact` checks.

## 3. Preserve valid speaker/override Undo and Redo

**Files/functions:**

- `packages/storage/src/corrections.ts`: `applyFinalPass`, `mapSpeakers`, `undo`, `redo`, `resolveSpeakerId`, `resolveDisplay`.
- `packages/storage/src/library.ts`: existing `applyFinalPass` / `changeTranscript` transaction.

Current `applyFinalPass` drops every history entry containing speaker or override patches.

**Replacement rule:**

- Rebase a speaker patch only when its target has a unique, supported final identity.
- Rebase all references consistently: patch ID, non-null `Speaker.id`, `mergedInto`, and override `speakerId`.
- Preserve null creation/deletion sides, entry IDs, stack order, and the existing distinction between Undo and Redo.
- Keep a timestamp override only when its intended track and words remain provably the same after final retiming.
- Validate an entry as a whole, including correction patches. Do not keep partial patches from an invalid entry.
- Verify meaningful operations in both Undo and Redo directions. Reject a rebase that becomes a no-op or changes another speaker.

**Explicit unsafe-entry policy:** Drop an entry that cannot be safely rebased. Also drop every entry in either stack touching the same speaker or override IDs, following dependencies transitively until no retained entry references an invalidated operation. Preserve unrelated entries in their original order.

The **current user-visible decisions remain saved**, even when their historical Undo/Redo entries cannot safely survive. Flag affected unresolved speaker identities for manual review; never redirect an invalid operation to another speaker.

Do not introduce a separate suspended-history store or new history contract.

## 4. Manual-resolution marker and clearing rules

**Storage:** Add optional `Speaker.needsManualResolution?: boolean` in `packages/storage/src/formats/transcript.ts`. Missing values mean `false`; retain schema-v2 compatibility.

**Contract — needs owner approval:** Add exactly the same optional field to `Speaker` in `packages/contracts/src/types.ts`.

**Backend/UI:**

- `apps/desktop/src/main/meetings.ts`, `toContractSpeaker`: forward the field.
- `packages/storage/src/corrections.ts`, `activeSpeakers`: include flagged speakers even when no final segment currently references them.
- `apps/desktop/src/ui/components/speakers/SpeakerLabel.tsx` and `apps/desktop/src/ui/screens/speakers/MeetingSpeakers.tsx`: display a small **Needs review** indicator, alongside the retained original name and existing speaker actions.

Existing `TranscriptPage.speakers` and `TranscriptChanged.speakers` can carry the field. No new IPC call or event is proposed.

**Clear the marker only after an explicit, successful user decision that actually resolves the affected identity:**

- Renaming a flagged **final speaker** explicitly establishes that speaker's displayed identity and clears its marker.
- Merging a retained live speaker into a chosen final speaker resolves that relationship; clear the resolved source/target markers without clearing unrelated ambiguous candidates.
- Renaming an inactive retained live speaker does **not** establish its final mapping, so its marker remains.
- A meeting deletion removes its records. There is currently no separate meeting-speaker deletion action; do not introduce one.

Displaying the speaker, reloading, running another final pass, or performing automatic profile matching must **not** clear the marker. Reassignment alone does not resolve an uncertain identity.

## 5. Final speaker IDs: handle collisions only

**Files/functions:**

- `packages/storage/src/corrections.ts`: `applyFinalPass`, `mapSpeakers`.
- `packages/app-core/src/final-pass.ts`: `toModelReplacement`, `FinalPassQueue.process`, only as necessary to preserve a collision remap for downstream use.
- `packages/transcription/src/finalPass.ts`: `diarizeTrack` and `decideSpeakers` remain unchanged.

Live worker speaker IDs are run-scoped `...-live-N`; final speakers use `speaker-N`. These do not collide during the first final pass. Do not unnecessarily re-key them.

**Real hazard:** A second final pass may reuse `speaker-1`. The old historical `speaker-1` record is skipped by `mapSpeakers` because the incoming ID already exists, while history can then target an unrelated new speaker with that same ID.

Before applying an incoming final replacement, compare its speaker IDs with **all existing speaker IDs**, including historical/inactive records. Re-key only collisions, using a deterministic unique identifier such as `final:<nextRevision>:speaker-N`. Preserve stable `you` identity.

Update all incoming segment and speaker references consistently. Keep the display numbering determined by final diarization, independently of live numbers. Preserve the remap for the existing post-final matching call without changing its matching logic.

**Required regression:** Perform two final replacements whose independently generated `speaker-1` identities represent different speakers. Verify distinct persisted IDs, intact historical user names and Undo/Redo targets, no unintended alias, and correct display after reopening.

## 6. Concurrent edits and existing persistence guarantees

`Library.changeTranscript` already reads the latest transcript under a per-meeting lock, performs a revisioned atomic save, and prevents concurrent edits from being overwritten by a stale snapshot. Keep reconciliation inside that locked mutation.

Add regressions for a rename or override committed during final inference, a failed save before replacement, and reopening after a successful replacement.

**Out of scope:** New readback reconciliation for a generic error after atomic rename; that is an existing storage concern, not a Slice 2b change.

## 7. Pre-approval calibration — separate measurement task

**Timing:** Complete before owner approval of the proposed overlap thresholds, and before threshold-dependent implementation is accepted.

**Inputs:** Retained public AMI **ES2004a** live and final transcript/diarization outputs from the Mac evidence tree:

`/Users/brandonchen/Documents/ChatGPT/srcb/`

The exact child-directory names and individual JSON filenames are **unverified**. Do not fabricate them or substitute an unrelated meeting.

**Read-only inventory command for the future measurement task:**

```
find /Users/brandonchen/Documents/ChatGPT/srcb/ \
  -iname '*ES2004a*' -print
```

From those results, identify the preserved **pre-final live speaker/word snapshot** and **post-final speaker/word snapshot** for the same ES2004a recording. If the snapshots cannot be located, stop and report calibration blocked. Do not regenerate audio or rerun a model.

**Run exactly one silent, offline comparison:**

1. Pin four distinct names to the four live speakers using retained ES2004a identity annotations, independently of speaker numbers. Keep these pins in memory; do not modify saved transcripts.
2. Load the paired live/final JSON snapshots. Use the meeting-track word intervals to compute the 10 ms overlap matrix.
3. Apply exactly the Section 2 thresholds: 10 s minimum shared speech, 70% two-way coverage, 20-point margin, and both 5 s competing-edge rules.
4. Compare accepted final assignments with ES2004a's retained reference speaker identities. Do not infer correctness from live/final label equality.
5. Report a four-row table with: pinned live name, live ID, true final ID, candidate final ID, shared seconds, two coverage percentages, both margins, competing-edge result, transfer/rejection, and whether a legitimate match was rejected.
6. Summarize **X of 4 speakers transferred**, incorrect transfers, legitimate matches rejected, and the specific threshold responsible for each rejection.

The measurement may use a temporary read-only analysis outside the repository. It is **not** an implementation commit, test run, diarization rerun, sound playback, or new application behavior.

**Calibration limits:** The 10 ms calculation verifies the proposed rule against the retained output, not general accuracy. If the retained reference annotations cannot independently establish which final speaker corresponds to each of the four people, report identity correctness **unverified**, not a calibration pass.

## 8. Deterministic silent regression tests

**Proposed only; not run.**

| File                                                                                     | Required coverage                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/storage/test/corrections.test.ts`                                              | Exact 10 s, 70%, 20-point, 5 s/15%, and 5 s/10% boundaries; ties; 80/10 split; competing names; one-to-many; many-to-one; microphone exclusion; word-bin double-count prevention                                       |
| `packages/storage/test/corrections.test.ts`                                              | Named live speaker matching two final speakers keeps both final speakers distinct; original name survives without unsafe alias                                                                                         |
| `packages/storage/test/corrections.test.ts`                                              | Speaker and override patches; null-sided patches; valid Undo/Redo before and after final; invalid-entry removal, transitive linked-entry removal across both stacks, and preservation of unrelated mixed-stack entries |
| `packages/storage/test/library.test.ts`                                                  | Concurrent rename/override during inference, failed save before replacement, reopened transcript/review flag, second final pass with `speaker-1` collision                                                             |
| `apps/desktop/src/main/live-transcript.test.ts` or existing integrated recording harness | **One** Stop-before-final/late-old-run-message regression from Section 1                                                                                                                                               |
| Existing UI component tests                                                              | Retained inactive speaker and review marker visible; explicit resolving rename/merge clears only appropriate markers; reload and another model pass do not clear them                                                  |

Use invented transcripts, timed words, and controlled asynchronous operations only. No model, microphone, playback, native recording, or long-running test.

## 9. Small reviewable implementation order

1. **Overlap and identity:** Implement conservative `mapSpeakers`, remove losing-final-speaker auto-merges, and add threshold/ambiguity tests.
2. **History and collision:** Rebase safe Undo/Redo, prune unsafe dependent entries, re-key actual final-ID collisions, and add repeated-final/concurrency/reopen tests.
3. **Review state:** Add storage `needsManualResolution`, exact clearing rules, and coverage for retained user identities.
4. **Contract/UI:** After owner approval of the single contract field, expose the marker through existing speaker payloads and display it in existing controls.
5. **Integration verification:** Run focused checks and cross-platform CI, then independent code review before merge.

Prefer small PRs or a stacked integration branch where intermediate changes cannot safely stand alone.

## 10. Non-goals and unverified items

No voiceprint learning, profile provenance field, profile-matching algorithm change, diarization/model/VAD changes, native capture changes, worker-generation redesign, extra live-write guards, new IPC calls/events, atomic-save recovery redesign, sound, or Windows long tests.

**Unverified:** Real-world suitability of overlap thresholds; the precise retained ES2004a evidence filenames; availability of independently labeled final speaker identities; native/model performance; and any future test outcome.

## 11. Risky changes requiring owner approval

Only these two Slice 2b decisions require specific owner approval:

1. **Contract:** `Speaker.needsManualResolution?: boolean` in `packages/contracts/src/types.ts`, passed through the existing transcript speaker fields.
2. **Threshold rule:** The Section 2 overlap thresholds and competing-edge policy, **after** the Section 7 calibration results are reported.

No additional owner approvals are proposed for profile provenance, new IPC methods, storage schema redesign, or shutdown changes.

## 12. Questions unresolved by repository inspection

- Which exact retained ES2004a live/final JSON files are beneath `/Users/brandonchen/Documents/ChatGPT/srcb/`? Their locations were not established from the pinned repository.
- Do the retained ES2004a annotations independently identify all four speakers in both outputs? Without that evidence, rejected legitimate matches cannot be scored reliably.

**Revision session:** November 11, 2026, 23:50:20–23:53:59 PT. GPT-6, ChatGPT chat/cloud. Five-hour and weekly remaining allowances before/after: unavailable/not applicable; no displayed quota readings. No usage-tracker row or repository file changed.

### Change log — v1 to revised plan

- Removed redundant worker-shutdown redesign, generation serialization and storage late-write guards; retained one targeted ordering regression.
- Removed profile provenance and profile-matching modifications. Transfer is now restricted to `name` and `userNamed`.
- Removed generic post-rename atomic-save reconciliation.
- Restricted final-ID re-keying to real collisions, especially repeated final passes.
- Defined deterministic removal of unsafe Undo/Redo entries and their dependent history.
- Removed automatic merging of losing final speakers and specified when manual-review flags clear.
- Added the read-only ES2004a calibration procedure before threshold approval.

Remaining owner decisions: two. Contract review flag and calibrated matching thresholds.

