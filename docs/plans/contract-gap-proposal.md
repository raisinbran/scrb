# Task 5: Consolidated UI/backend contract-gap proposal

**Status:** Proposal only; `packages/contracts/` is unchanged. Owner has authorized Task 5, **not** blanket implementation of every proposed API.
**Base `main`:** `09ab9f52e3202e7c799c1d1cb3e9de26aab16c0a`
**Inputs reviewed:** all five `docs/handoffs/2026-10-30-*-gaps.md` files (Live, Speakers/Settings, Recordings, Export/Summary, Final Pass); requirements v1.2; UI specification; current `packages/contracts/src/{backend,types,validate}.ts`; `apps/desktop/src/main/{meetings,recording}.ts`.

## Approve in two small batches

The contract already has many required calls. Add only APIs whose information **cannot** be obtained reliably through existing calls; define ambiguous behavior in comments/tests instead of inventing APIs.

### Batch A — Needed to make V1 behavior correct (approve now)

| Gap / source | Smallest proposed contract change | Required semantics |
| --- | --- | --- |
| Live: Undo after reload | `getUndoState({meetingId}): UndoState` | Reads persistent history, including after final pass; separate from `getTranscript` paging. |
| Recordings + final pass: status | Add `'transcriptionFailed'` to `MeetingStatus`; `MeetingDetail.transcriptionFailure?: string | null`. Add `retryFinalPass({meetingId}): void` and `meetingChanged: MeetingListItem` event. | No fake `ready` status. Retry only for stopped/sealed meetings with audio; prevent duplicate passes; preserve corrections; event when state changes. On failure include safe user text. |
| Import privacy + reload | `importAudioFile` response includes `privacyBannerRequired: boolean`; add `listImports(): ImportProgress[]`. | Only backend decides jurisdiction; banner applies when profile building enabled. Outstanding imports reappear after reload; failure and cancel both leave no created meeting. |
| Recordings: missing audio | `MeetingDetail.hasAudio: boolean` | False after audio-only auto-delete, and on any other no-audio meeting; UI hides/disables playback. |
| Summary editing | Extend `SummaryItemUpdate` with explicit `{kind:'add',collection:'actionItems' | 'decisions' | 'openQuestions',item:...}` and `{kind:'remove',collection:...,itemId:...}` variants. | Backend validates ID/collection, owns edits, protects user-edited items on regeneration, and marks summary edited. Ensure matching item type per collection. |
| Live: pause spans | `timelineGapsChanged: {meetingId: MeetingId; gaps: TimelineGap[]}` event | Appends/sends complete, monotonic confirmed gaps; `getMeeting` remains the authoritative snapshot on reload. Do not guess missing audio is paused. |
| Speakers: pending matches | `listSpeakerSuggestions({meetingId?}): SpeakerSuggestion[]` | Saved pending suggestions survive window reload; decision via existing `answerSpeakerSuggestion`. No names from meeting-app APIs. |
| Settings: jurisdiction | `getPrivacyJurisdictions(): {countries: string[]; usStates: string[]}` | Backend reads editable local settings file; OS-derived country is populated in existing `AppSettings.location.country` when first launched outside US (no extra country call). |
| Vocabulary: undo/redo | `undoVocabulary(): VocabularyUndoState`, `redoVocabulary(): VocabularyUndoState`, `getVocabularyUndoState(): VocabularyUndoState` (`{canUndo,canRedo}`) | Global Vocabulary screen history, separate from meeting `undo({meetingId})`. Preserve term edits/enable/disable/delete across restart. |
| Models: trial/rebuild | `tryModel({role,meetingId}): {trialId}`; `modelTrialProgress` event; `rebuildVoiceProfiles(): {jobId}`; `profileRebuildProgress` event | Trial must not replace the active model, modify the meeting, or build profiles; rebuild requires confirmation and never processes audio that was deleted. Expose a previous-installed-model flag in `ModelInfo` for enabled Revert control. |

`SummaryItemUpdate` uses a discriminated union in the eventual patch; the table is a signature sketch, not ready-to-paste TypeScript. Add `CALL_TABLE`, `EVENT_TABLE`, `REQUEST_CHECKS`, mock handlers, IPC allowlists and tests in the **same approved change**. No renderer imports backend modules.

### Batch B — Clarify without adding calls (approve now)

1. `selectSources` during recording: reject changed mic/app with `conflict`; unchanged selection is harmless. Resume stable source from backend, not optimistic UI state.
2. `levelMeter` emits during active `startAudioCheck` while idle; normal idle otherwise shows no live reading. Existing `audioCheck` is the mic test.
3. `TranscriptChange.replace`: `removedSegmentIds` are removed first; supplied segments then replace by ID or insert by time. If sequence/revision skips or rows are not loaded, reload the needed page. A selected word that disappeared is **invalid**, not silently edited at a guessed timestamp.
4. A correction may cross segment boundaries but not tracks; use the inclusive `WordRange` in reading order. Backend rejects partial overlap with a saved correction; UI never supplies arbitrary word IDs beyond the two ends.
5. Live playback: allow only sealed/readable chunks; `seekAudio` on an as-yet-unwritten time is `conflict`. Never wait on playback in the capture path.
6. File picker tokens: single-use for a successful import; failed/cancelled retry requires a new picker token. Correct `cancelImport` documentation: both failure and cancellation leave no new meeting; only cancellation indicates it stopped at user request.
7. `MeetingFilter.from/to`: inclusive **meeting date shown in the library**, rather than converting midnight between local/UTC. Add optional `filter?: MeetingFilter` to `searchMeetings` using the existing type. If this is deemed a feature rather than clarification, bundle into Batch A.
8. Profile-to-meeting navigation needs no new call in V1: show accessible meeting list from Recordings filtered by known speaker/profile only when an index-safe backend query exists; never leak transcript text into SQLite. Storage-location changes must choose a new library only after explicit migration/confirmation, not silently leave the existing library behind.

### Export/summary: backend fixes, not broad contract expansion

- `needsReview` and `alsoAtMs` already exist on summary items: adapt `packages/export` to print the flags/times, no new contract fields.
- Current summary v3 stores inferred project developments in narrative text without timestamp. **Defer** a new `ProjectImpactItem` to a separately approved format-v4 plan with migration/tests; until then avoid claiming 100% timestamped evidence on these narrative lines.
- `impactInferred` currently labels every decision area inferred, even a user-set value. **Propose** `DecisionItem.impactBasis: 'stated'|'inferred'|'userEdited'` plus matching storage/engine fields only in that format-v4 change. Keep the conservative label until then.
- `criticalDecisions` currently means all `decided` decisions. Keep that defined rule unless the owner chooses a separate importance marker. Existing `summary.ts` v2->v3 upgrade handles case/unknown impact values in current `main`; do not re-fix the historical note without a reproducing test.

## Dependency order and acceptance

1. Approve Batch A and B as an **interface specification**; freeze the exact TypeScript shape before backend and mock work. UI and backend implement matching slices, with no temporary direct imports.
2. Test request validation and allowlists; snapshot/event-reload parity; failed final-pass retry; privacy banner on import; deleted-audio UI; summary add/remove; vocabulary history; model trial isolation and safe profile rebuild. Ensure every new call has success, `notFound`, `conflict`, and invalid-request coverage where relevant.
3. `npm run check`, `npm run test:smoke`, both OS UI checks and the gate are performed by Claude Code before merging. For the final-pass failure test, use synthetic audio and an intentionally invalid tool path; no real meeting content.

**Not run for this proposal:** no code or contract edits, npm checks, smoke tests, or hardware tests. All proposed additions remain unapproved code changes until reviewed in their implementation slices.
