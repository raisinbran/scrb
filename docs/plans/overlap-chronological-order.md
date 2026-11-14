# Order overlapped speech chronologically (revision 2)

**Status:** draft for owner approval, independent review pending. Plan only; no code changed. Revision 2 replaces the first plan (merged in #179) after the owner's answers of 2026-11-14.

## In plain words

**What goes wrong today.** When you and a remote person talk over each other, the app files each person's words as one block per turn and lists blocks by when they started. Your one-minute turn is listed first; the other person's "right" said 30 seconds into it is listed after the whole minute. While you play the recording, the highlight keeps jumping between the two places.

**What changes.** Final transcripts are cut where someone else genuinely speaks inside your turn: your words up to that point, then their words, then the rest of yours. A turn with nobody breaking in stays one paragraph, up to about a minute, and is cut only when it runs longer than that.

**Benefit.** The transcript reads in the order things were said, and following along no longer jumps back and forth.

**What it cannot do.** The app only knows who said a word if the recording tells it. Your microphone is its own track, so your words and the remote people's words are always told apart. Two _remote_ people who overlap are told apart only when the voice-separation step notices the second voice, and in measured tests it often does not (see section 3). When it does not, the words stay in the first person's text, in the right time order but under the wrong name; you can fix the name with the existing speaker edit.

**Risks, short.** More, shorter rows (not for long solo turns). A few extra timestamps in exports. Old recordings stay as they are until you press a new "Re-process" button (section 6), which needs your approval because it touches the app contract. Corrections and undo are safe by design (section 7).

**Decisions for you (flagged in sections 2 and 6):** (1) one-word backchannels such as "yeah": own line in time order (recommended) or left in place; (2) the Re-process button and its wording.

## 1. Cause, from the code

Current main (`7be97ff` plus later merges; line numbers are for `origin/main` at `2eee5d8`).

1. **Words are in time order within each track, grouped by track.** `assemble` sorts words by track (meeting first, then mic), then start (`packages/transcription/src/finalPass.ts:334`). `buildTurns` (`finalPass.ts:504`) walks that list and closes a turn on a speaker change or a pause over `TURN_GAP_MS` = 1500 ms (`:40`). A turn is a contiguous range of the list (`firstWord`, `wordCount`), and has **no length limit**.
2. **Same track: already chronological when diarization separates the speakers.** If remote speaker B's words are labelled B inside remote speaker A's talk, the speaker change closes A's turn, so the output is A, B, A. (This corrects the first plan, which over-claimed here.)
3. **Different tracks: never interleaved.** You (mic) and remote speakers (meeting) are different ranges of the word list, so a mic turn is never cut by meeting words or the reverse. Turns are then sorted by start (`finalPass.ts:340`). A mic turn from 0-60 s with a remote "right" at 30 s gives `You 0-60`, `B 30`: the interjection lands after the whole minute. This is the main source of the owner's symptom, because "you talk over a remote person" is the commonest overlap and needs no diarization to detect.
4. **Long turns multiply the effect.** With collapsed diarization one speaker gets very long turns (an owner recording had 395-word and 35-minute segments; `docs/handoffs/2026-11-14-speaker-and-followalong-diagnosis.md`). The live pass caps spans at 15 s (`MAX_SEGMENT_MS`, `livePass.ts:16`); the final pass has no cap.
5. **Storage and display keep the order.** `toModelReplacement` makes one stored segment per turn (`packages/app-core/src/final-pass.ts:120`). Storage sorts segments by first-word start (`sortSegments`, `packages/storage/src/corrections.ts:36`); `resolveDisplay` (`:1162`) walks them in order and only splits at a speaker override; `toTranscriptPage` (`apps/desktop/src/main/meetings.ts`) slices that list.
6. **Follow-along uses list order.** `rowIndexAt` (`apps/desktop/src/ui/screens/recordings/transcript-model.ts:61`) finds the last row starting at or before the playhead; `activeRowAt` (`TranscriptTab.tsx:298`) looks back up to 30 rows for a row whose word is current. At 31 s it picks the interjection row (below the long turn); at 33 s that row is over and it falls back to the long turn above. Each switch scrolls. PR #214 separately fixed a row taller than the list.

## 2. The rule

All of it lives in the final pass's turn construction (`packages/transcription/src/finalPass.ts`), after `assemble` has the sorted words and before turns are returned. Pieces are always **contiguous sub-ranges of one track's words**, so `firstWord`/`wordCount` stay valid and nothing downstream changes shape.

**Constants (starting values, tune on the AMI replay in section 5):**

| Name                               | Value     | Meaning                                                                                   |
| ---------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `MAX_PARAGRAPH_MS`                 | 60 000    | A turn longer than this is cut (step 3)                                                   |
| `MIN_PIECE_MS` / `MIN_PIECE_WORDS` | 2 000 / 3 | Every piece around a cut must have at least this much, either one                         |
| `MAX_INTERJECTION_MS`              | 10 000    | Another turn longer than this is a real parallel turn, not an interjection; it never cuts |
| `CUT_WINDOW_MS`                    | 3 000     | How far from the interjection's start a cut may move to a better boundary                 |
| `CUT_PAUSE_MS`                     | 400       | A pause this long between two words counts as a boundary                                  |

**Steps**

1. Build base turns as today (`buildTurns`, unchanged). This keeps same-track splitting exactly as now.
2. **Interjection cuts.** For each turn T, find every other turn U (any speaker, **different track from T only**) with `T.startMs < U.startMs < T.endMs`, `U.endMs - U.startMs <= MAX_INTERJECTION_MS`, and at least one word with letters or digits (ignore empty or punctuation-only words). For each such U, in time order, pick the cut: the best word boundary of T's words within `U.startMs ± CUT_WINDOW_MS` **and with the right-hand piece starting at or after `U.startMs`** (a boundary before the interjection would make the right piece start before it, so it would sort ahead of the interjection; this rule guarantees the order left piece, interjection, right piece), preferring (a) after a word ending `.`, `?` or `!`, then (b) a pause of at least `CUT_PAUSE_MS`, else (c) the first word starting at or after `U.startMs` (exact time). Because of the rule above, a sentence end or pause _before_ `U.startMs` is never chosen; the nearest one at or after it, within the window, is. Within a rank, take the one closest to `U.startMs`; earlier on a tie. Skip the cut if either piece would be smaller than `MIN_PIECE_MS` **and** `MIN_PIECE_WORDS`, counting pieces left by earlier cuts of T. If a cut is skipped, U stays a separate turn ordered by start (it appears after the part of T that contains its start; harmless).
   - Same-track speaker changes need no step 2; they already split.
   - Why different track only: track identity is certain (mic = you). Cutting on same-track labels would let a diarization error shred a paragraph, and same-track labels already split today without new guards.
3. **Length cap.** Any piece still longer than `MAX_PARAGRAPH_MS` is cut at the best boundary (sentence end, else pause of at least `CUT_PAUSE_MS`, else the largest pause) within the last 15 s before the 60 s mark; if none, at the word nearest 60 s. Repeat until all pieces fit. Pieces from step 2 are not merged back.
4. **Order.** Sort all turns by `startMs`, then `endMs`, then `speakerId` (string compare) so ties are deterministic. A cut piece that starts at the same instant as its interjection sorts after it because its end is later. Speaker identity never decides order except as the last tie-break.

**Backchannels ("yeah", "mm-hm", "right", one word, 0.2 to 0.6 s). Owner decision 2026-11-14: option A.**

- **Option A, chosen.** A backchannel on the other track cuts the turn like any interjection and gets its own short row in time order. The transcript is exactly chronological and the follow-along does not bounce. Cost: more rows in a conversation with many "yeah"s; a paragraph is cut into pieces of at least 2 s or 3 words.
- **Option B (not chosen, kept for reference).** Only interjections of at least 2 words or 1.0 s cut. One-word backchannels become their own rows, still sorted by start, so they appear after the paragraph they interrupted (up to a minute later) and the follow-along bounces to them and back. Fewer rows; pair it with the optional sticky follow-along (slice 3) to hide the bounce.

Reason: the owner's example ("right" at 30 s) is a one-word backchannel and chronological order was the request. The change between A and B is one constant (`MIN_INTERJECTION_WORDS` 1 or 2, plus `MIN_INTERJECTION_MS` 0 or 1000).

**Echo caution.** If the room leaks into the mic and `dropRoomEcho` misses a run, those leaked words are a fake "You" interjection and would cut a remote paragraph. The guards above (pieces of 2 s or 3 words) limit the damage to a few extra rows; `dropRoomEcho` is not touched.

## 3. What diarization can and cannot do

Evidence (ES2004a, public AMI, one meeting, one int8 model; [trace](../research/overlap-loss-trace-20261112.md), [experiment](../research/overlap-loss-experiment-20261112.md), [recovery plan](overlap-recovery.md)):

- Of 83.02 s of reference overlap, raw output shows 2+ speakers for 33.00 s (40%), 1 for 44.60 s and none for 5.42 s; after our final relabel, 24.04 s (29%). In 52% of the frames where the model reports one speaker, its own mean speaker count is below 1.0, so it does not signal a second voice at all and no threshold change recovers that.
- Sherpa drops a single speaker's segment of 0.3 s or less (trace fact 4), keeps two speakers in a frame only when the mean count reaches 1.5 (`+ 0.5` rule), allows at most two simultaneous speakers per frame, and embeds only non-overlapped frames. A remote person with less than the short-speaker floor of total speech is folded into a larger speaker by `relabelClusters` (floor raised and guarded in PR #217; read the current value in `finalPass.ts`).
- **Not measured:** the shortest utterance diarization reliably gives to the right speaker. The measurements above are about overlapped frames, not interjections as words. State: very short (under about 0.5 s) interjections inside another remote speaker's talk are mostly **not** separable today; longer ones (1 s and up) are sometimes.
- **Practical split for this plan.** You versus remote: always reliable (separate tracks). Remote versus remote: best effort. When diarization labels an interjection as the main speaker, nothing can be cut: the words stay in the main speaker's text, in correct time order, under the wrong name, and the existing speaker edit corrects it. Whisper on the mixed meeting track may also drop overlapped words entirely; that is outside this plan.

**How to measure on AMI (needs no owner recordings).**

1. From the AMI reference annotations of the eight meetings used in `docs/research/ami-short-speaker-sweep-20261114.md`, list interjections: reference segments by one speaker lying inside (or touching) another speaker's talk, bucketed by length (under 0.5 s, 0.5-1, 1-2, 2-4 s) and by overlapped or not.
2. Run the final-pass diarization once per meeting with the existing `scripts/research/ami_speaker_dump.mts` (about 6.5 minutes per meeting; eight meetings are about 52 minutes in total, and splitting them into separate processes does not avoid the 20-minute rule). **The campaign needs the owner's explicit approval before it starts**, or run it in bounded batches of at most two meetings (about 13 minutes each), each batch approved separately, apply the shipped relabel, and for each interjection report the fraction of its duration labelled with the correct final speaker (best one-to-one mapping as in `ami_speaker_score.py`).
3. Report the table per bucket. Decision use: it sets how often the "wrong name" case happens for remote-versus-remote interjections; it does not change the rule.

## 4. UI versus backend

| Part                                        | Side    | Files                                                                                                               |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| Interjection cuts, length cap, tie rule     | backend | `packages/transcription/src/finalPass.ts` (+ tests in `packages/transcription/test/`)                               |
| Re-process entry (gate and status handling) | backend | `apps/desktop/src/main/meetings.ts` (`retryFinalPass`), `packages/app-core/src/final-pass.ts`                       |
| Re-process button                           | UI      | `apps/desktop/src/ui/screens/recordings/MeetingDetailView.tsx`, mock in `apps/desktop/src/ui/mocks/mock-backend.ts` |
| Sticky follow-along (optional)              | UI      | `TranscriptTab.tsx` (`activeRowAt`), `transcript-model.ts`                                                          |

No file in `packages/contracts/` changes in slices 1 and 3. Section 6 lists the one possible contract change separately.

## 5. Tests (invented data or public AMI only)

1. **Unit, `buildTurns`/new cut step** (extend `packages/transcription/test/parsing.test.ts` or a new `final-pass-order.test.ts`). Invented words:
   - You 0-60 s continuous; remote "right" at 30 s: expect You 0-30, remote, You 30-60 after the sort.
   - Cut moves to a sentence end within 3 s; else to a pause; else exact time.
   - Regression: T has a sentence end 2 s before `U.startMs` and none after within the window; the right-hand piece must start at or after `U.startMs` (cut falls back to the exact-time word), so the order is T-left, U, T-right and never T-left, T-right, U.
   - Guards: interjection 1.5 s after the turn start (piece under 2 s and 3 words) does not cut; two interjections 3 s apart cut at most once where a piece would fall below the floor.
   - Interjection longer than 10 s does not cut; same-track speaker change still cuts as before (existing test at `parsing.test.ts` "builds turns on speaker change and long gaps" passes unchanged).
   - A 150 s single-speaker run with no interjection becomes pieces of at most 60 s, split at sentence or pause; a 55 s run stays one piece.
   - No words are lost, duplicated or reordered per track; `firstWord`/`wordCount` ranges are contiguous and cover all words once; output order is identical on shuffled input and on repeat.
   - Option A versus B: one-word backchannel cuts under A, not under B.
2. **`assemble` end to end** with fake diarization spans: mic track plus two remote speakers; asserts the final turn order and that `toModelReplacement` maps pieces to segments with matching word ids.
3. **Storage, no regression** (`packages/storage/test/`): apply a final pass with split segments on a transcript that has an active correction, a speaker override, and undo history; the correction and override survive, undo and redo still work, display order equals stored order.
4. **AMI replay, no audio and no model.** Use the AMI reference words with times (public); put one participant on the mic track and the others on the meeting track; run the cut step; report the number of rows before and after, the longest paragraph, and the count of interjections cut versus skipped by each guard. Run it for eight meetings; each run is seconds.
5. **UI** (only if slice 3 is built): `TranscriptTab.follow.test.tsx` case with overlapping rows; the highlight does not flip while the current row still has a current word.
6. `npm run check`; `row-heights.perf.test.ts` for row volume.

No test here is expected to exceed 20 minutes. Do not use the owner's real recordings; the diagnostic copies in the 2026-11-14 note were an owner exception for that note only.

## 6. Re-processing existing recordings (owner request: an in-app option, not a silent migration)

**What exists.** `retryFinalPass({ meetingId })` is already in the contract (`packages/contracts/src/backend.ts:203`) and the backend (`apps/desktop/src/main/meetings.ts:351`). It only accepts `status === 'transcriptionFailed'` with saved audio, sets `finalPassRunning`, and enqueues the pass. The UI shows it only as "Retry transcription" on a failed meeting (`MeetingDetailView.tsx`). The engine already handles a re-run over an existing transcript: `applyFinalPass` (`packages/storage/src/corrections.ts:995`) replaces the model layer, keeps corrected words (`mergeModel`/`mergeTrack`) and transfers speakers; interrupted passes resume at startup (`resumeFinalPasses`, `final-pass.ts`).

**What is missing.**

1. The backend gate refuses `ready` and `recovered` meetings. Needed: also accept those, still requiring `hasAudio` and readable sealed tracks.
2. **Failure safety (real risk).** A failed pass sets `transcriptionFailed` (`final-pass.ts:363`), and `getTranscript` then throws for that status (`meetings.ts:400`). A failed re-run of a good old recording would hide its transcript. Needed: remember the status before the run (`ready` or `recovered`) and restore it on failure, keeping a safe user message; also restore on cancel or app restart mid-run. This is a small persisted field on the meeting record (storage package, `packages/storage/src/formats/`), not a contract field.
3. A button with an honest label. Suggested: on a finished meeting with audio, "Re-process transcript" with a one-line explanation: "Re-runs speech recognition and speaker detection with the current app. Your edits and speaker names are kept where the words still match." Disabled while any pass runs; hidden when the audio was deleted by auto-delete (`hasAudio` false). Also tell the user the summary may become outdated (`summaryState`).

**Owner decision (2026-11-14): the Re-process button is approved as a contract addition, button wording "Re-process".** The contract options below stay for the implementer to choose the form; the owner's approval covers the addition, and slice 4 may start. Previously stated options:

**Contract change.** Option 1 (recommended): **no type change**. Reuse `retryFinalPass` and widen its server-side precondition; update its doc comment in `backend.ts` to say it also re-processes a finished meeting. This still edits `packages/contracts/`, so it needs your approval even though only a comment changes. Option 2: add `reprocessFinalPass: { request: { meetingId }; response: void }` (clearer name, a real contract change, mock and validator entries needed: `backend.ts`, `validate.ts`, `mock-backend.ts`, `hybrid-backend.ts`). I recommend option 1. Nothing in `packages/contracts/` is edited by this plan.

**Corrections on re-run.** `mergeModel` keeps frozen (corrected) words by matching surrounding words or time (`locateRun`, `corrections.ts` near line 540), and the test for it must run against split segments (test 3). A correction whose words changed in the new recognition is kept and may be placed a few words away; that already happens on any re-run.

**Not silent.** Nothing runs on upgrade. The user presses the button per recording. A confirm dialog is optional; the single-line explanation above is the minimum.

## 7. Risks, re-checked against the new rule

| Risk                                                                                                                    | Verdict                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corrections keyed to word ids; "consecutive" means reading order of a track's words (`selectSpan`, `corrections.ts:55`) | Safe. Pieces are contiguous sub-ranges of one track's sorted words, so flattening stored segments by first-word start gives the same word order as before for that track. Add test 3.                                                                                                                   |
| `mergeModel`/`mergeTrack` frozen words on a re-run                                                                      | `mergeTrack` re-sorts incoming words by time per track (`corrections.ts` ~line 639) and rebuilds segments from the incoming segment of each word, so more segments change grouping only. Covered by test 3; the review must run a meeting with corrections before and after a re-run.                   |
| Undo stack and speaker edits                                                                                            | History holds word ids and track/time overrides (`overrideFor`), not segment ids. Final pass already rebases or drops entries it cannot prove safe. Unchanged. Test 3.                                                                                                                                  |
| Segment ids change                                                                                                      | They are new random ids per final pass today. Unchanged.                                                                                                                                                                                                                                                |
| Export timestamps                                                                                                       | One timestamp and speaker label per segment (`packages/export/src/layout.ts` ~line 386, 452). Splitting adds rows only where another speaker cut in or a turn passes 60 s. Slice 2 checks the output on a replay transcript and merges adjacent same-speaker rows in export only if noisy.              |
| UI row volume                                                                                                           | Long solo turns: fewer tall rows, no change below 60 s. Heavy backchannel conversations: more short rows. `row-heights.perf.test.ts` plus AMI replay counts (test 4).                                                                                                                                   |
| Follow-along bounce                                                                                                     | Removed for cut interjections (rows are now in time order). Residual: a skipped cut, a same-track mislabel, a parallel turn over 10 s. Optional slice 3.                                                                                                                                                |
| Selection across rows                                                                                                   | Already supported on one track (`meetings.ts` `selectedWordIds`). Interleaved rows are on different tracks or speakers, so a selection stays on one track; a selection spanning an interleaved other-track row is refused with the existing "Select words on one track" message. Mention in the review. |
| Old recordings                                                                                                          | Unchanged until Re-process.                                                                                                                                                                                                                                                                             |
| Diarization errors                                                                                                      | A wrong label never causes a new cut (cuts use tracks only), so errors cannot shred a paragraph beyond today's behavior.                                                                                                                                                                                |
| Echo leakage                                                                                                            | Limited by piece-size guards; see section 2.                                                                                                                                                                                                                                                            |
| Failed re-process hides the transcript                                                                                  | Real; fixed in section 6 item 2. Must be in slice 4, with a test: a failing runner restores the previous status and the transcript still loads.                                                                                                                                                         |

## 8. Slices (for Codex or Claude; each small, each independently reviewed)

1. **Backend cut rule** (section 2) in `finalPass.ts` with tests 1, 2, 3 and `npm run check`. Backchannel option: implement A with the two constants named so B is a one-line change. No contract change. Start here.
2. **AMI replay and export check** (test 4, export output on a split transcript). Tune constants if the replay shows shredding or no effect; report numbers in `docs/research/`.
3. **Optional UI: sticky follow-along** only if the owner still sees bounce after slice 1 on a real, owner-run check: in `activeRowAt`, stay on the previous active row while it still has a current word; when no row has one, keep the previous row. Test 5.
4. **Re-process** (section 6): backend gate widening and status restore with tests, then the button and mock. Owner approved the contract addition on 2026-11-14; no further approval needed to start.
5. Measurement in section 3 can run any time, in parallel; it changes no code.

**Possible later item, needs owner approval, not part of slice 1: "Short replies" display setting.** A setting, default "show all", that hides only filler backchannels (1-2 words, matched from a fixed list: yeah, yep, mm-hm, uh-huh, right, okay, ok, sure, ...) in the transcript view and in exports. It filters at display time and never deletes data, so turning it off restores everything and no per-line work is needed. Substantive short words (yes, no, agreed, correct, numbers, names) are never in the list. Design notes for whoever picks it up: a rows-only filter in `resolveDisplay` or the UI, a new setting (contract change, owner approval), export option, and the summary must not use hidden text differently from shown text. **Export (owner decision 2026-11-14):** exports follow the screen setting by default, and the export dialog always shows a checkbox to keep or remove filler words. The checkbox starts at the screen's Short replies setting at the moment the user clicks the first Export button, and toggling it affects that export only, never the screen setting. This touches the export dialog and needs an export option in the contract, so any contract change needs owner approval. Sized small; build only if the extra rows from option A bother the owner after use.

## 9. Open items for the owner

1. Backchannels: **decided, option A** (own line in time order).
2. Paragraph cap 60 s and the 2 s / 3 word minimum piece: acceptable?
3. Re-process: **approved by the owner on 2026-11-14** (contract addition, wording "Re-process"). Implementer chooses option 1 or 2 in section 6 and notes the choice in the PR.
