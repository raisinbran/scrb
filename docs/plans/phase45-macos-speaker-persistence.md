# macOS Phase 4/5: persistent speaker split proposal

## Overview

> **Historical plan:** This document preserves the proposal and pre-implementation test notes.
> The ready-only atomic split was subsequently implemented in PR #50; the passages below
> describing it as unimplemented or awaiting review refer to the original planning stage.
> Neither the implementation nor this historical note constitutes Gate 4/5 approval.

The real final-pass diarization pipeline exists, but persistent speaker editing is incomplete. Start with one atomic split of selected words in a finished (`ready`) real meeting. This is a proposal for owner review, not implemented functionality or Phase 4/Gate 4 approval. The proposed restriction to finished meetings needs owner acceptance; live splits and speaker undo across a later final pass remain separate work.

This plan follows the repository's short written-plan process. `dev-plan/Meeting Scribe - Development Process.md` requires approval before data-risk changes and says Planner was never installed. The create-plan CLI is unavailable here; the generated diff was checked with `git apply --check`, not `planner check`. No implementation source or interface was changed.

## Definition of Done

A real `splitSpeaker` call creates one persistent meeting speaker and one selected-span override in a single existing atomic transcript save and undo entry. After closing and reopening the library, Undo removes both; after another reopen, Redo restores the same IDs. Existing corrections, model words, profiles and other meetings remain intact. Busy meetings return `conflict` until safe final-pass history semantics are implemented.

Goals:

- Reuse the existing `splitSpeaker` request and `{ speakerId }` response unchanged.
- Reuse `Library.edit`, its per-meeting lock, summary invalidation and atomic file writer.
- Keep the slice entirely outside the UI and shared interface folders.
- Demonstrate restart persistence through real handler dispatch and real temporary storage, using invented words.

## Current State

Base commit: b0a0127cfe1a83b9f8a32911f6271fbb7405aa34

Repository: `raisinbran/scrb`. Branch: `rosmont/phase45-speaker-persistence-20261103`. PR #48 is pinned at the base above; neither draft was merged or cherry-picked. Mac Gate 3 remains as approved. Windows Gate 3, capture, IPC, file formats and shared interfaces are outside this proposal.

Read Development Plan v2.0, Development Process, root AGENTS.md, PR #35 and PR #48 metadata, PR #35's QA handoff, Tasks 21/23/24 handoffs, Tasks 23/26/27 gap review, and the approved transcript-layer and vocabulary plans. The older handoffs describe several gaps already fixed in this candidate; the classifications below come from its source and selected baseline tests.

| Classification                              | Capability and evidence                                                                                                                                                                                                                                                                     | Remaining gap                                                                                                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Working backend, synthetic baseline checked | Final pass runs Whisper then Sherpa segmentation/embedding, relabels clusters and assigns words; recorded Stop and imports save the replacement through the library (`packages/transcription/src/finalPass.ts`, `packages/app-core/src/final-pass.ts`, `apps/desktop/src/main/imports.ts`). | No fresh native diarization quality measurement here; do not infer DER or Gate 4 acceptance.                                                                                                                                                                                |
| Working backend, synthetic baseline checked | Meeting rename/merge/reassign, correction layers, atomic saves, restart persistence, correction undo after finalization and vocabulary repair have real implementations (`packages/storage/src/library.ts`, `corrections.ts`, `apps/desktop/src/main/meetings.ts`).                         | Speaker history is explicitly filtered out by `applyFinalPass`; this is not undo support across finalization. Selection requests still lack a revision argument.                                                                                                            |
| Partially wired                             | PR #48 routes meeting edits and nested speaker rename/merge to the owning real backend and forwards existing events.                                                                                                                                                                        | Real split and suggestion-answer handlers are absent; routing them currently ends in `notImplemented`. Suggestions return an empty list, not persisted results.                                                                                                             |
| Partially wired                             | Profile matching/growth algorithms exist in `packages/transcription/src/profiles.ts`; SQLite profiles support create/grow/rename/merge/delete.                                                                                                                                              | Final conversion discards embeddings; no production final/import integration calls the matching/growth algorithms. Import opt-in is stored but does not currently build profiles. No durable pending-suggestion store.                                                      |
| Mock-only in the hybrid app                 | Profile-only and vocabulary screens/actions remain on the mock in `apps/desktop/src/ui/lib/hybrid-backend.ts`.                                                                                                                                                                              | Real handlers/stores exist but are not reached by those hybrid calls. Globally listing pending suggestions also remains on the mock.                                                                                                                                        |
| Partially wired                             | Vocabulary has real remembered-correction provenance, deletion suppression, restart repair, edit/disable/delete and bounded hints for final/import recognition.                                                                                                                             | Profile and vocabulary undo stacks are memory-only; restart clears history. Vocabulary history returned by the handler is synthetic creation/last-update information. Live native worker path does not pass vocabulary hints. No fresh recall/false-replacement evaluation. |
| Missing from active live workflow           | The standalone `LivePass` has clustering code.                                                                                                                                                                                                                                              | The app's `live-feed.ts` uses `LiveAudioWorker`, which emits You/Meeting labels; standalone clustering is not the active live integration.                                                                                                                                  |

### PR #35 overlap with PR #48

Compared PR #35 head `91cef4f9c96c6c4263e4d1ae6fcfab30fa0f9f67` against the pinned candidate, not against today's main. Their common ancestor is `7a081ca885ecdb611d83728fea189ea777f2d89b`.

None of PR #35's six fixes is incorporated: transcript-row speaker menus, closing the editor after selection loss, loading saved undo state, loading pending suggestions, vocabulary Undo/Redo, and profile rename/merge Undo/Redo are all absent from the candidate. Thirteen of the fourteen changed paths exactly match PR #35's parent; the remaining `LiveScreen.test.tsx` differs for other work. The shared UndoRedo component and PR #35 QA handoff are absent. Existing SpeakerLabel dialogs, mock operations and backend interface calls predate PR #35 and must not be treated as new work to import.

PR #48's import privacy reminder and real-meeting routing address separate gaps identified in PR #35's handoff. They do not incorporate its six fixes. Bring forward only reviewed UI hunks on a separate UI change; do not cherry-pick the entire draft or overwrite the routing/playback/import changes. The finished-meeting transcript is still read-only; a later UI handoff must make the proposed real split reachable for selected final words.

## Module Shape

`packages/storage/src/corrections.ts`
`packages/storage/src/library.ts`
`apps/desktop/src/main/meetings.ts`
`apps/desktop/src/main/meetings.test.ts`

## Step 1: add atomic speaker split and persistence tests

Add a pure storage transformation beside reassignment. Validate the selected original words before creating any saved state. Create the new speaker and its time/track override together, and record both patches in one history entry. The library wrapper uses the same locked atomic write path as existing speaker edits. The handler uses existing visible-to-original selection resolution and committed revision events; no new IPC call is needed.

Limit the handler to `ready` meetings for this slice. This is a proposed product limitation, not an approved change to the interface. It avoids offering a split during a final pass that will discard its undo entry. Resolve a missing meeting through existing `notFound` handling and a changed selection through existing `conflict` handling. Never create a profile or grow an embedding for a manual split.

The two proposed behavioral tests cover restart/Undo/Redo persistence through the real dispatcher and refusal during finalization with a valid selected span. A fresh test reviewer recommended removing a redundant stale-selection test because it only exercised the existing endpoint resolver. The reviewer also caught an initially empty busy-meeting fixture; the diff below seeds valid words so removal of the status guard makes that test fail. These proposed tests have not been executed.

Risks and proof:

- A partial split could leave an orphan speaker or override. Both records enter one existing atomic write; verify both disappear and reappear together through Undo/Redo and reopen. Existing atomic-write fault tests protect the shared writer; do not create a second write path.
- A stale selection could target other speech. Reuse endpoint resolution and validate consecutive original IDs again inside the locked transformation. A revision-aware request remains a separate owner proposal; do not claim this resolves every stale selection with surviving IDs.
- Finalization could discard speaker undo. Reject a split while the meeting is not ready; test with valid words. Do not retain unsafe history by removing the existing filter.
- Naming could pollute voice profiles. New manual speaker has `profileId: null`; the persistence test checks that no profiles are created.

Exact generated proposal (not applied):

```diff
--- a/packages/storage/src/corrections.ts
+++ b/packages/storage/src/corrections.ts
@@ -302,7 +302,44 @@
   return replaceSpeakers(transcript, 'Merge speakers', [{ ...from, mergedInto: intoId }]);
 }

-/** Moves a span to another speaker. Splitting a speaker is a series of these. */
+export function splitSpeaker(
+  transcript: TranscriptFile,
+  wordIds: string[],
+  newLabel: string,
+): TranscriptFile {
+  const span = selectSpan(transcript, wordIds);
+  const first = span[0] as PlacedWord;
+  const last = span.at(-1) as PlacedWord;
+  const speaker: Speaker = {
+    id: randomUUID(),
+    label: newLabel,
+    name: newLabel,
+    profileId: null,
+    userNamed: true,
+    mergedInto: null,
+  };
+  const override: SpeakerOverride = {
+    id: randomUUID(),
+    track: first.segment.track,
+    startMs: first.word.startMs,
+    endMs: last.word.endMs,
+    speakerId: speaker.id,
+  };
+  return pushHistory(
+    {
+      ...transcript,
+      speakers: [...transcript.speakers, speaker],
+      speakerOverrides: [...transcript.speakerOverrides, override],
+    },
+    'Split speaker',
+    {
+      speakers: [{ id: speaker.id, before: null, after: speaker }],
+      overrides: [{ id: override.id, before: null, after: override }],
+    },
+  );
+}
+
+/** Moves a span to an existing speaker. */
 export function reassignSpeaker(
   transcript: TranscriptFile,
   wordIds: string[],
--- a/packages/storage/src/library.ts
+++ b/packages/storage/src/library.ts
@@ -537,6 +537,10 @@
     return this.edit(meetingId, (t) => corrections.mergeSpeakers(t, fromId, intoId));
   }

+  splitSpeaker(meetingId: string, wordIds: string[], newLabel: string): Promise<TranscriptFile> {
+    return this.edit(meetingId, (t) => corrections.splitSpeaker(t, wordIds, newLabel));
+  }
+
   reassignSpeaker(
     meetingId: string,
     wordIds: string[],
--- a/apps/desktop/src/main/meetings.ts
+++ b/apps/desktop/src/main/meetings.ts
@@ -381,6 +381,38 @@
         throw error;
       }
     },
+    splitSpeaker: async (request) => {
+      const { meetingId, range, newLabel } = request as {
+        meetingId: string;
+        range: WordRange;
+        newLabel: string;
+      };
+      const meeting = await requireMeeting(library, meetingId);
+      if (meeting.status !== 'ready') {
+        throw new ContractError({
+          code: 'conflict',
+          message: 'Wait for the final transcript before splitting a speaker.',
+        });
+      }
+      const before = await library.readTranscript(meetingId);
+      try {
+        const after = await library.splitSpeaker(
+          meetingId,
+          selectedWordIds(before, range),
+          newLabel,
+        );
+        const speaker = after.speakers.at(-1);
+        if (!speaker) throw new Error('Split did not create a speaker');
+        publishEdit(before, after, emit);
+        await publishOutdated(library, before, after, emit);
+        return { speakerId: speaker.id };
+      } catch (error) {
+        if (error instanceof CorrectionConflictError) {
+          throw new ContractError({ code: 'conflict', message: 'The selected text changed.' });
+        }
+        throw error;
+      }
+    },
     reassignSpeaker: async (request) => {
       const { meetingId, range, speakerId } = request as {
         meetingId: string;
--- a/apps/desktop/src/main/meetings.test.ts
+++ b/apps/desktop/src/main/meetings.test.ts
@@ -41,6 +41,106 @@

   const recorded = (title: string, date: string) =>
     library.createMeeting({ title, date, source: 'recorded', status: 'ready', durationMs: 5000 });
+
+  it('persists split undo across restarts', async () => {
+    const { id: meetingId } = await recorded('Invented split', '2026-11-03T10:00:00Z');
+    await library.appendSegments(
+      meetingId,
+      [
+        {
+          id: 's1',
+          speakerId: 'a',
+          track: 'meeting',
+          pass: 'final',
+          words: [
+            { id: 'w1', text: 'hello', startMs: 0, endMs: 400 },
+            { id: 'w2', text: 'there', startMs: 500, endMs: 900 },
+          ],
+        },
+      ],
+      [
+        {
+          id: 'a',
+          label: 'Speaker 1',
+          name: null,
+          profileId: null,
+          userNamed: false,
+          mergedInto: null,
+        },
+      ],
+    );
+    const root = library.paths.root;
+    const result = await dispatchCall(handlers, 'splitSpeaker', {
+      meetingId,
+      range: { firstWordId: 'w2', lastWordId: 'w2' },
+      newLabel: 'Invented voice',
+    });
+    expect(result).toMatchObject({ ok: true, value: { speakerId: expect.any(String) } });
+    const saved = await library.readTranscript(meetingId);
+    const speakerId = saved.speakers.at(-1)?.id;
+    expect(saved.undoStack).toHaveLength(1);
+    expect(library.voiceProfiles.list()).toEqual([]);
+    await library.close();
+
+    library = await Library.open({ root });
+    handlers = createMeetingHandlers(library);
+    expect(await library.readTranscript(meetingId)).toEqual(saved);
+    expect(await value('getTranscript', { meetingId, offset: 0, limit: 10 })).toMatchObject({
+      segments: [{ speakerId: 'a' }, { speakerId }],
+      speakers: [{ id: 'a' }, { id: speakerId, label: 'Invented voice' }],
+    });
+    expect(await dispatchCall(handlers, 'undo', { meetingId })).toMatchObject({ ok: true });
+    const undone = await library.readTranscript(meetingId);
+    expect(undone.speakers.map((speaker) => speaker.id)).toEqual(['a']);
+    expect(undone.speakerOverrides).toEqual([]);
+    await library.close();
+
+    library = await Library.open({ root });
+    handlers = createMeetingHandlers(library);
+    expect(await dispatchCall(handlers, 'redo', { meetingId })).toMatchObject({ ok: true });
+    const redone = await library.readTranscript(meetingId);
+    expect(redone.speakers).toEqual(saved.speakers);
+    expect(redone.speakerOverrides).toEqual(saved.speakerOverrides);
+    expect(redone.segments).toEqual(saved.segments);
+  });
+
+  it('refuses split during finalization', async () => {
+    const { id: meetingId } = await library.createMeeting({
+      title: 'Invented pending split',
+      status: 'finalPassRunning',
+    });
+    await library.appendSegments(
+      meetingId,
+      [
+        {
+          id: 's1',
+          speakerId: 'a',
+          track: 'meeting',
+          pass: 'final',
+          words: [{ id: 'w1', text: 'hello', startMs: 0, endMs: 400 }],
+        },
+      ],
+      [
+        {
+          id: 'a',
+          label: 'Speaker 1',
+          name: null,
+          profileId: null,
+          userNamed: false,
+          mergedInto: null,
+        },
+      ],
+    );
+    const before = await library.readTranscript(meetingId);
+    expect(
+      await dispatchCall(handlers, 'splitSpeaker', {
+        meetingId,
+        range: { firstWordId: 'w1', lastWordId: 'w1' },
+        newLabel: 'Invented voice',
+      }),
+    ).toMatchObject({ ok: false, error: { code: 'conflict' } });
+    expect(await library.readTranscript(meetingId)).toEqual(before);
+  });

   it('maps library rows to list items, newest first', async () => {
     const older = await recorded('Older', '2026-10-01T10:00:00.000Z');
```

## Verification

Baseline checks executed on macOS 27.0.1, build 26A434, arm64:

```sh
export PATH=/Users/brandonchen/.local/share/scrb-node/current/bin:$PATH
npm ci --offline --ignore-scripts --cache /Users/brandonchen/.npm
npm test -- packages/transcription/test/speakers.test.ts packages/transcription/test/profiles.test.ts packages/storage/test/corrections.test.ts packages/storage/test/library.test.ts packages/storage/test/index-db.test.ts packages/app-core/src/final-pass.test.ts apps/desktop/src/main/meetings.test.ts apps/desktop/src/main/imports.test.ts apps/desktop/src/ui/lib/hybrid-backend.test.ts
```

Result: 9 test files passed, 213 tests passed in 2.94 seconds on the unchanged candidate. No native workers, confidential recordings or physical recording sessions were used. The first attempt with a symlink to another checkout's dependencies failed during configuration because `@vitejs/plugin-react` was missing; the symlink was removed and the isolated offline install above fixed test setup. No lockfile changes.

After approval and implementation, run the two proposed tests before the fix to prove failure, then after the fix. Temporarily remove the ready-status guard to verify the busy-meeting test fails. Run the selected baseline command above, `npm run check`, and `npm run test:smoke`. Check the generated diff for unrelated changes and keep interfaces unchanged. Full check, smoke and the proposed tests were not run during this planning task.

Only after the real split workflow is functional and reachable, perform a short Mac app check with an invented two-speaker fixture: finish/import, rename a speaker, split selected final words, restart, Undo, restart, Redo, inspect labels and play the selected audio. Until the final transcript has selection/edit controls, use a clearly documented backend integration check and leave UI physical verification pending. Record the exact app commit, commands, fixture source and observed results. No endurance run or reopening of Mac Gate 3 is required. A synthetic persistence check is not Gate 4/5 approval.

## Notes for agents

1. **user-decided:** preserve the approved Mac Gate 3 result, use `rosmont/*`, avoid Windows Gate 3 changes, and never merge without approval.
2. **inferred from code:** final diarization already runs. Its profile result is lost at `toModelReplacement`; adding another diarizer is not the first slice.
3. **orchestrator-proposed:** first ship a persistent atomic split for ready meetings only. The owner must accept this temporary restriction before implementation; changing speaker history across finalization needs a separate data-risk plan.
4. **inferred from code:** transcript schema v2 already supports speaker and override history patches; this slice needs no migration or shared interface change.
5. **next slice:** define and test stable speaker identity/history rebasing across final passes before extending splits to recording/finalization. Start with `packages/storage/src/corrections.ts` (`mapSpeakers`, `applyFinalPass`) and `packages/storage/test/corrections.test.ts` plus `library.test.ts`. Cover changed IDs, repeated passes, names/merges/overrides, Undo and Redo before/after reopen, and split history in redo when finalization occurs. Do not blindly keep history or equate speaker numbers across passes.
6. **subsequent work:** connect final embeddings to matching and durable suggestions/profile growth with explicit import opt-in, model identity, crash-safe idempotence and deletion behavior; route profile/vocabulary calls only after real/mock isolation tests. That work needs its own persistence design and any schema/interface changes proposed for owner review.
7. **UI handoff:** selectively port PR #35's absent fixes in a UI-only change while retaining PR #48 routing/import/privacy/playback. Add finished-transcript selection and split reachability through the existing Backend interface. The current backend-only proposal does not modify UI files.
8. **validation limit:** `git apply --check` confirms only patch applicability. Planner is unavailable, and the proposed implementation has not been typechecked, built or run. The 213 passing tests describe the pinned baseline. No Phase 4, Gate 4 or Gate 5 approval is claimed.
