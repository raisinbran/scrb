# Order overlapped speech chronologically

**Status:** draft for owner approval. Plan only; no code changed. Independent review pending.

## Problem

When two speakers talk over each other, the final transcript puts one speaker's whole turn first and the other's interjection after it, paragraphs later. In playback, "Jump to current position" then bounces between the two places.

This is about **order**. Overlap that diarization never detects is a different problem, already traced in [overlap-loss-trace-20261112.md](../research/overlap-loss-trace-20261112.md) and [overlap-loss-experiment-20261112.md](../research/overlap-loss-experiment-20261112.md); not repeated here.

## Cause (from the code)

1. **A final-pass turn has no length limit.** `buildTurns` (`packages/transcription/src/finalPass.ts:323-359`) closes a turn only on a speaker change or a gap over `TURN_GAP_MS` (1500 ms, line 32). One speaker talking for five minutes with pauses under 1.5 s is one turn, one segment. The live pass caps spans at 15 s (`MAX_SEGMENT_MS`, `livePass.ts:16`); the final pass has no equivalent.
2. **Turns are ordered by turn start.** `assemble` sorts turns by `startMs` then `endMs` (`finalPass.ts:250`). `toModelReplacement` turns each turn into one stored segment (`packages/app-core/src/final-pass.ts:90-104`), and storage sorts segments by first-word start (`sortSegments`, `packages/storage/src/corrections.ts:36-39`, used at lines 440 and 876). So if A speaks 0-300 s and B says "right" at 120 s, the list is A (the whole block), then B.
3. **The display keeps that order.** `resolveDisplay` (`corrections.ts:1162-1230`) walks stored segments in order and only splits a segment where the speaker changes mid-segment (a speaker override). `toTranscriptPage` slices that list (`apps/desktop/src/main/meetings.ts:262-272`).
4. **Follow-along works from the list.** `rowIndexAt` finds the last row that starts at or before the playhead (`apps/desktop/src/ui/screens/recordings/transcript-model.ts:56-71`). `activeRowAt` (`TranscriptTab.tsx:282-289`) prefers an earlier row whose word is current, looking back up to 30 rows. At 121 s it picks B (many paragraphs below). At 123 s B has ended, so it falls back to A (above). Each flip scrolls the list. The code comment on `activeRowAt` already mentions this case.
5. **Words are fine.** Within a track, words are in time order (`finalPass.ts:244`), and each word keeps its own speaker (`assignSpeakers`, `speakers.ts:312`). Only the grouping into long blocks is wrong.

Live screen: its rows come from the live pass, which already caps spans at 15 s, so the effect is much smaller. `insertionRow` and `loadedSegmentAt` (`apps/desktop/src/ui/screens/live/transcript-store.ts:174-178, 296-305`) assume rows do not overlap in time; that gets slightly wrong for overlapped rows but is out of scope.

## Smallest fix

**Split long turns at the source, so the existing sort-by-start gives near-chronological order.** No contract change, no new ordering code.

In `buildTurns`, also close a turn when any of these holds (checked per word, same speaker only):

- the turn already holds a sentence end (a word ending `.`, `?` or `!`) and is at least `MIN_CHUNK_MS` (about 3 s) long; or
- the pause before this word is at least `SOFT_GAP_MS` (about 700 ms) and the turn is at least `MIN_CHUNK_MS`; or
- the turn would exceed `MAX_CHUNK_MS` (15 s, matching live). Cut at the largest pause among the last few words, else at the word.

Constants are starting values; tune on the fixtures below. Whether whisper words carry punctuation must be confirmed in slice 1 (`parseWords`, `whisper.ts:290+`); if they do not, the pause and 15 s rules still work alone.

**Order rule.** Chunks sort by first-word start. Ties (same millisecond) break by end time, then by speaker id, so the order is deterministic. The speaker who started first goes first; nobody is "owed" the first slot. An interjection that lands mid-sentence appears after the sentence it cuts into (at most about one chunk, 15 s, late), which keeps sentences readable. That is the intended trade.

**Follow-along (UI, optional slice 3).** With chunks of 15 s or less the flip lasts a few rows, not paragraphs. If it is still jumpy in the owner's check, make `activeRowAt` sticky: stay on the current row while it still has a current word, and when none does, keep the previous row instead of falling back to `rowIndexAt`. Time based, not list based, and it needs no data change.

## UI vs backend

| Part | Side | Files |
| --- | --- | --- |
| Split rule in `buildTurns` | backend | `packages/transcription/src/finalPass.ts` |
| Tie rule | backend | same file, line 250 |
| Sticky follow-along (only if needed) | UI | `TranscriptTab.tsx`, `transcript-model.ts` |

No change to `packages/contracts/`. The contract already allows any number of segments in time order, and the UI only reads them.

Existing meetings keep their long segments until their final pass is re-run. A display-time split in `resolveDisplay` would fix them too but touches correction tokens and display ids (`${segment.id}:${part}`); not proposed now. Ask the owner whether old recordings matter.

## Risks

- **Corrections.** They are keyed to word ids, not segment ids, and "consecutive" means consecutive in track reading order, the flattened stored segments (`selectSpan`, `corrections.ts:54-66`). Splitting changes grouping only; word ids and the flatten order stay in step with the display order because both use the same sort. New segment ids come from the new final pass, as today.
- **Final pass replacing a transcript that already has corrections.** `mergeModel` (`corrections.ts:861-880`) keeps frozen (corrected) words by word match inside a region, not by segment. Smaller segments change only region boundaries, and the existing freeze tests must pass unchanged. The review should check one meeting with edits made before a re-run.
- **Undo stack and speaker edits.** History entries hold word ids and overrides by track and time (`overrideFor`, `corrections.ts:1141-1150`), not segment ids. Expected unaffected; add one test.
- **Export.** `packages/export/src/layout.ts:386-387` sorts by `startMs` and prints a timestamp per segment, so shorter segments mean more timestamps and more speaker labels in export. Check the layout and decide whether adjacent same-speaker chunks should merge in export. Known visible change; the biggest "cost" of this fix.
- **UI volume.** More rows per hour (about 3x for a monologue). Rows are virtualised with measured heights (`row-heights.ts`); run `row-heights.perf.test.ts`.
- **Speaker-edit selection across rows.** Selecting a range now crosses more row boundaries; `meetings.ts:60-80` already supports that on one track.
- **Quality.** Splitting must not lose or reorder words: assert the concatenated words equal the input.

## Tests (AMI fixtures or invented data only)

1. `buildTurns` unit tests (extend `packages/transcription/test/parsing.test.ts`): a 60 s one-speaker run becomes chunks of at most 15 s with all words kept in order; split at a sentence end and at a pause; no split under `MIN_CHUNK_MS`; speaker change still splits; existing test at line 127 keeps passing.
2. `assemble` test with invented words: A speaks 0-60 s, B says two words at 30 s. Expect A-chunk, B, A-chunk by start; and ties give the same order on repeated runs and with input shuffled.
3. Storage: `toModelReplacement` then `mergeModel` with an existing correction inside a long old segment; the correction survives; undo and redo still work.
4. UI: `transcript-model` test for the follow-along with overlapped rows (only if slice 3 is done); no flip while the current row still has a current word.
5. Optional, no hardware: run the final-pass word/turn stage on the AMI ES2004a words if already in `fixtures`; otherwise invented data covers it. Nothing recorded by the owner is used.

No test here is expected to exceed 20 minutes.

## Slices

1. **Backend split and tie rule** (`finalPass.ts` + tests 1-3). Run `npm run check`. Review: independent.
2. **Export check:** confirm export output on a split transcript is acceptable; merge adjacent same-speaker rows in export only if the review finds it noisy. Backend (`packages/export`).
3. **Sticky follow-along** (UI) only if the owner still sees jumping after slice 1 on a real, owner-run check. Skip otherwise.

## Contract changes needed

None.

## Open questions for the owner

1. Are old recordings worth re-processing, or do new ones suffice?
2. Is about 15 s the longest acceptable paragraph, given more rows and more export timestamps?
