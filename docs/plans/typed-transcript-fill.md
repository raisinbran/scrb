# Plan: fill the transcript from the user's typed notes

**Status:** proposed 2026-11-12 from the owner's 2026-11-11 request. Needs independent review (by an agent other than the author; **review pending**) and owner approval before any code. Docs only. Needs a contract change, which only the owner can approve.

## Goal

The user pastes notes they typed during or after a meeting (partial, with gaps). The app compares them with the automatic transcript and **suggests** replacements where the typed text clearly says what the transcript got wrong. The user accepts or rejects each one. Nothing changes without a click.

## What exists today

- **Requirements v1.2:** the feature is not listed. Closest items are "Corrections and vocabulary" (select a word, correct it, undo/redo) and V1 item 4 (remember approved corrections). It would need an owner amendment, as audio import got on 2026-10-29. Model fine-tuning from corrections is explicitly out of V1, and this plan does not touch it.
- **Development Plan v2.0:** Phase 5 covers corrections, frozen spans and vocabulary. Nothing about external text.
- **Contract (`packages/contracts`):** `applyCorrection({ meetingId, range: WordRange, text, remember })`, `undo`/`redo`, `getTranscript` (words carry `startMs`, `endMs`, `state`, `correctionId`), `transcriptChanged`, plus the suggest-and-answer pattern for speakers (`listSpeakerSuggestions`, `answerSpeakerSuggestion`) and vocabulary (`listVocabularySuggestions`, `answerVocabularySuggestion`). No call takes external text.
- **Backend:** `packages/storage/src/corrections.ts` keeps corrections in a separate layer, freezes corrected spans through live and final passes, and supports undo/redo. `packages/storage/src/vocabulary-suggestions.ts` turns repeated corrections into vocabulary suggestions. `packages/app-core/src/vocabulary-hints.ts` feeds hints to recognition.

## Smallest useful V1 slice

1. Recording detail gets a **Fill from notes** button. The user pastes plain text. Nothing is saved: the notes live only in the open dialog.
2. A pure function in `packages/app-core` aligns the notes to the meeting's resolved transcript words (corrections already applied, so a corrected word is never offered a second change):
   - Normalise both sides (lowercase, strip punctuation, collapse whitespace).
   - Word-level alignment (edit-distance dynamic programming) with fuzzy word equality (similar spelling or sound-alike, tolerant of one or two letter differences).
   - **Anchors:** runs of at least 3 consecutive matching words. Only text between two anchors can become a suggestion; text before the first or after the last anchor is ignored. This stops a large unrelated paragraph from mapping onto the transcript.
   - A **suggestion** is a gap between anchors where the typed words differ from the transcript words, both sides are non-empty, are within 8 words, and the lengths are within a ratio of 2. Typed text with no transcript counterpart (the user typed what the recogniser dropped), and transcript text the notes skip (the notes have gaps), produce nothing.
   - Each suggestion has the transcript span (as a `WordRange` within one segment and one track), the current text, the proposed text and the start time. Spans that cross segments or tracks are dropped.
3. A review list shows each suggestion with current text, proposed text, a play-from-here button, and **Accept** / **Reject**. Reject only hides it. **Accept calls the existing `applyCorrection`** with `remember: false`, so undo/redo, frozen spans, summary-outdated marking and persistence all come for free.
4. Accept all is not in V1: every change is reviewed.

`remember` stays off by default so a typo in someone's notes does not become a vocabulary term. The existing vocabulary suggestions still see accepted corrections, so repeated accepted fills can earn a vocabulary suggestion through the normal rule (3 corrections across 2 meetings).

## Contract change (owner approval needed; this plan does not edit `packages/contracts/`)

One new call and one type, listed in `Backend`, the call allowlists in preload and main, and the contract and validation tests:

```ts
suggestTypedFills: {
  request: { meetingId: MeetingId; notes: string };   // notes capped at 100,000 characters
  response: TypedFillSuggestion[];
}
interface TypedFillSuggestion {
  id: string;            // stable within one response
  range: WordRange;
  currentText: string;
  proposedText: string;
  startMs: number;
}
```

- It is stateless and read-only: no new event, no stored notes, no answer call. Accepting uses `applyCorrection`.
- Errors: `notFound` for a missing meeting, `conflict` while that meeting is being recorded or finalised, `invalid` for empty or over-long notes. Result is capped at 200 suggestions.
- Staleness: a final pass can change words after the list was made. `applyCorrection` already rejects stale ranges as `conflict`; the UI then re-runs the request. No new rule.

## Out of scope for V1

- Inserting words the recogniser missed entirely (`applyCorrection` needs existing words to replace).
- Speaker names in notes, timestamps in notes, importing a file (paste only), accepting all at once, saving notes with the meeting, using notes to bias live recognition, fixing text during a live recording (post-meeting meetings only).
- Any cloud or model call: the matching is local and deterministic.

## Where it belongs: after M1, not before

The owner's M1 goal is a roughly usable app for ongoing meetings: accurate transcription, speaker grouping, self-learning from corrections. This feature helps none of the three directly, needs a contract change and a requirements amendment, and costs about three working days. It is also useful only once the transcript is good enough to align against, so it should follow the M1 transcription and diarization work. **Recommendation: schedule it right after M1 and the UI fixes A/B/C, and treat it as the first post-M1 item.** If the owner wants it sooner, the aligner can be built and tested without any contract change (it is a pure function), but nothing should be wired up before approval.

## Risks

| Risk                                                        | Handling                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong suggestion looks plausible                            | Anchors, length limits and per-item accept. Tests include notes that disagree on purpose.                                                       |
| Alignment cost on a long meeting                            | Cap notes size; align per anchor window rather than the full matrix; test a 2-hour transcript against 5,000 words of notes under a time budget. |
| Notes mention names or numbers that sound alike             | Numbers and names are compared exactly after normalisation, not fuzzily.                                                                        |
| Notes contain private content                               | Processed in memory, never logged or stored, never sent anywhere.                                                                               |
| Fills conflict with corrections or a final pass             | Corrected words are excluded; accept goes through `applyCorrection` conflict checks.                                                            |
| Owner expectation of "fill gaps" means adding missing words | Stated as out of scope above; confirm with the owner when approving.                                                                            |

## Tests

- **Aligner unit tests** (invented data, no real recordings): exact match gives none; one misheard word; a two-word swap; notes that skip half the transcript; notes with extra lines; repeated phrases (anchor ambiguity); punctuation and case; span at a segment boundary dropped; already corrected words excluded; numbers and names; empty and oversized notes; time budget.
- **Handler test** in `apps/desktop/src/main`: calls the real handler against a library with a transcript, checks `notFound`, `conflict` during recording, and that nothing is written.
- **Contract tests:** the new name is in the allowlist in preload and main, validation rejects bad requests, and the mock matches the contract exactly.
- **UI tests** against the mock: paste, list, play-from-here, accept (one `applyCorrection` call, undo available), reject, stale `conflict` re-runs, keyboard use, and the dialog adds no colours outside `tokens.css`.
- **Evaluation:** one AMI fixture with notes made by hand-deleting and mistyping parts of its reference text; report precision (accepted suggestions that match the reference) before any threshold is called good.

## Cost estimate

| Part                                                  | Hours                         |
| ----------------------------------------------------- | ----------------------------- |
| Aligner and its unit tests                            | 8                             |
| Contract addition, validation, main handler and tests | 4                             |
| Mock backend and dialog/review list UI with tests     | 8                             |
| AMI evaluation and threshold tuning                   | 3                             |
| Review fixes and handoff                              | 3                             |
| **Total**                                             | **about 26 (range 20 to 32)** |

Backend and UI are separate changes on opposite sides of the folder boundary; the aligner and handler go first, then the UI. Plan review and owner approval are not counted.

## Agent usage log

Authored by Claude Code (Sonnet 5.5), Mac. Usage row to be appended to `agents/agent_task_allocation.md`; remaining-allowance figures unavailable to this session. Independent review: **pending**.
