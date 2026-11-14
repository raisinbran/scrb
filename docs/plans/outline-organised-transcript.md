# Plan: organise the transcript under a pre-meeting outline

**Status:** draft for owner approval, independent review pending. Docs only. Proposes a contract change (not made here; only the owner can approve it). Written 2026-11-14 so another agent can implement it later from this file alone.

Extends the draft in PR #131 (`docs/plans/typed-transcript-fill.md`, "fill the transcript from typed notes"). That plan fixes misheard words from typed notes. This one is a different feature: it files the existing dialog under the headings of an outline. They are independent; the only shared piece is a "paste text" entry (see Relation to #131).

## Summary for the owner

**What it does.** Before or after a meeting you paste (or open) an outline: headings and subheadings, such as "1. Budget / 1.1 Hiring / 2. Roadmap". After the meeting the app sorts the transcript under those headings. You see each heading with the dialog that was said about it, with speaker names and times. Anything it is not sure about goes in an "Unsure" or "Not placed" list instead of being forced under a heading.

**Benefit.** A long meeting becomes organised by topic without manual cutting and pasting. You can export it that way to Word or PDF.

**How it decides.** Mostly by (1) order: meetings usually follow the outline, so the next topic is more likely than a random one, but the app allows jumping back; (2) wording: how similar the spoken words are to the heading's words; (3) speaker, only if the outline says who owns an item (for example "Budget (Dana)").

**Risks.**
- A wrong placement can look like fact. So every placement carries a confidence, weak ones are not placed, the screen says "Automatic, check before relying on it", and every placement can be moved with a click.
- The outline text is private. Scribe never sends it anywhere (no network use). It is saved in the meeting folder inside your library folder, exactly like the transcript. If you chose a library folder that Dropbox, OneDrive, iCloud or similar syncs, that service copies the outline the same way it already copies your transcripts.
- Your own moves are tied to the exact words you moved, so they survive the final pass. If words are removed or changed, the move is kept and flagged "needs re-check"; it is never silently dropped.
- It will not be perfect. Honest expectation is in the Accuracy section; it must be measured before it is shipped.

**Effort.** About 55 hours (range 45 to 70) for the whole feature in five slices, no new model needed for the first usable version. Slice 1 is about 20 hours of behind-the-scenes matching plus an accuracy report (nothing to see in the app yet); the first thing you can use is slice 3. Two optional extras (a small downloaded wording model, Word-file input) are separate decisions. Needs your approval of a contract change. You called this nice to have, so it is sized to be cut after any slice.

## What the user sees

1. **Recordings, open a finished meeting.** A new tab next to Transcript called **Outline**. Empty state: "Add an outline to sort this meeting by topic." Buttons: **Paste outline** and (later) **Open file**.
2. **Paste outline.** A box and a live preview on the right showing how the app read the lines (indented or numbered lines become subheadings). The user can fix a misread level by clicking the line and choosing **Make heading / Make subheading / Remove**. Optional "(Name)" at the end of a line is read as the person responsible. When the meeting is sorted, the name is matched to the meeting's speaker names; a name that matches nobody is ignored with a note. Click **Sort the meeting**.
3. **Progress**, a few seconds to about a minute: "Sorting the transcript..." with Cancel.
4. **Result.** The Outline tab shows the outline as a tree. Each heading expands to the dialog under it, in time order: speaker, time, text, with Play-from-here like the Transcript tab. A small badge shows confidence ("Likely" / "Unsure"). Headings with nothing found show "No discussion found". A bottom group **Not placed** lists dialog the app would not file anywhere. A banner says "Automatic placement, check before relying on it".
5. **Fix a placement.** Select a block of dialog (click, shift-click to extend, the same way the Transcript tab selects), then either drag it onto a heading or use **Move to...** and pick a heading, **Move to Not placed**, or **Split here** (starts a new block at that sentence). The moved text turns "Confirmed" (no badge) and stays where the user put it, even if the app is re-run.
6. **Edit the outline later.** **Edit outline** reopens the paste box. After **Sort again**, confirmed moves stay, and only unconfirmed dialog is re-placed.
7. **Export.** The existing Export dialog gets one more checkbox for DOCX and PDF: **Group transcript by outline**. Off by default.
8. **After the final pass** (see below) a banner says "The transcript was refined. Sort again?" with a button; nothing moves silently.

## Input formats

- **V1: pasted text, and .txt / .md files.** Rules: a Markdown `#` heading, a numbered line (`1.`, `1.1`, `A.`), or a bullet is an item; depth comes from the `#` count, numbering depth, or indentation (2 spaces or one tab per level). Plain lines with no marker at the top level are headings. A trailing `(Name)` or `- Name` is the owner, returned by the parser as the typed name string only (a pasted outline has no meeting yet, so no speaker can be resolved at that point; the name is resolved to a `SpeakerId` in the meeting-aware sort step, case-insensitive against the speaker names, ignored with a note if none match). Up to 200 items and 50,000 characters. The parser is a pure function with a preview, so a misread is visible and fixable before sorting.
- **Slice 5, optional: .docx.** Read the Word heading styles ("Heading 1/2/3" and list levels) from `word/document.xml`, then use the same parser output. The repo already writes DOCX (`packages/export/src/render-docx.ts`) but has no reader; a reader needs a zip library, and the `docx` package's own dependency on one should be checked first. About 5 hours. Recommendation: do not include in V1; most people can paste a Word outline.
- Not planned: PDF input, images, calendar invites.

## How matching works

The transcript is first cut into **blocks**: consecutive segments of one speaker, split at pauses of 2 seconds or more, and long blocks split at about 60 seconds (tunable). A block is the unit that gets placed. Matching places every block under one outline item or under Not placed.

Three levels, cheapest first. Build level A fully before deciding on B or C.

### Level A (V1): wording score plus ordered path. Local, deterministic, no new model

- **Wording score** of block against item: TF-IDF style overlap on content words using the existing tokeniser and stemmer in `packages/summary/src/text.ts` (`contentTokens`, stopwords, stemming, `jaccard`). Dependency path: the matcher lives in a new pure package `packages/outline` that depends on `@scrb/summary`, which today does not export these helpers; slice 1 adds one line to `packages/summary/src/index.ts` exporting `contentTokens` and `jaccard` (backend only, no contract change). `app-core` and the main handlers then call `@scrb/outline`. (The parser, blocks and matcher are therefore in `packages/outline`, not `app-core` as listed under the split below.) The item's text is its own heading plus the headings above it (parent context), weighted lower. Words that appear in many items count less (IDF over the outline). Short blocks (under about 8 content words, like "yeah, right") get no wording score of their own and inherit from neighbours (see the path step).
- **Order prior and path.** Find the best assignment of all blocks to items with a Viterbi style dynamic programme: states are items plus "Not placed"; the cost of a block in an item is the negative wording score; **staying in the same item is free, moving to the next item costs a little, skipping forward costs a bit more per skipped item, jumping back costs more but is allowed**. This is the "use order as a strong prior, allow jumping back" rule: a block with a clearly better wording match to an earlier heading wins over the order prior, and a weak match follows the order. Cost: blocks times items squared at worst, trivially small (2-hour meeting: about 500 blocks times 60 items).
- **Not placed rule.** A run of blocks whose best score is below a threshold and that is not between two blocks of the same item stays Not placed. Short blocks between two blocks of the same item join that item (a one-word "right" stays inside its topic).
- **Speaker prior (only when the outline names an owner).** If an item has an owner and a block's speaker matches, add a bonus to that block for that item; if the block's speaker is someone else, no penalty (anyone can discuss anything). The speaker never places a block alone.
- **Confidence.** Score margin between the chosen item and the runner-up, combined with whether the neighbours agree. Below a cut-off the placement is marked "Unsure"; below a lower one it is Not placed.
- Tuning is the part that needs data, so the costs and thresholds are constants in one file, tested on the fixtures below.

### Level B (optional, needs owner approval of a new model): small local wording-meaning model

Replaces the wording score by cosine similarity between block and item text vectors, so "headcount" matches "hiring" and "money" matches "budget". Same path step on top. Needs a sentence-embedding model run on the device. **Nothing like it is in the repo today**: the only embeddings are speaker voice embeddings (`packages/transcription/src/speakers.ts`, `profiles.ts`, via sherpa), which compare voices, not meaning. A candidate is a small multilingual MiniLM class model (roughly 90 MB, ONNX, run through the same ONNX runtime family sherpa already uses); the exact model, its licence and whether it fits the model-download mechanism (`docs/plans/model-download.md`) must be checked and approved first. Run it only if the Level A accuracy test misses the bar. Add about 12 hours. Combine as a weighted sum of A and B scores, not a replacement, so exact words keep their advantage.

### Level C (last resort, per ambiguous block only): the local summary model

The summary feature already runs a local language model (llama-server, GGUF, about 8 GB, `packages/summary/src/worker.ts`, `llm.ts`). It could be asked, for only the blocks that A and B left Unsure, "which of these headings is this under, or none". It is the most capable, but slow, memory hungry and only available where the summary model is installed. **Not recommended for V1.** If used, keep it advisory: its answer changes an Unsure block to Likely only if it agrees with the top two path candidates.

Always local: no network, no cloud call, nothing sent anywhere.

## Corrections: how the user's moves persist

- New file in the meeting folder, `outline.json` (versioned like the other files in `packages/storage/src/formats/`): the parsed items (id, level, text, owner name), the automatic placements, and a separate **pins** layer. This mirrors how transcript corrections are a separate layer over model text.
- **A pin belongs to words, not to blocks.** Blocks are only a way to compute automatic placement and are re-cut after every sort or final pass. A pin stores the user's choice (item id or "Not placed") for a **word range**: first and last word id plus their `startMs`/`endMs` and a short fingerprint (the normalised text of the words, plus a few words of context on each side). A user move of any size, even 20 seconds inside what is later a 60-second block, therefore stays exactly that range.
- **Applying pins.** After any re-segmentation the app looks up each pin: first by word ids (they survive when the engine keeps ids), else by locating the fingerprint near the old time (the same context-search approach `packages/storage/src/corrections.ts` already uses for frozen corrections). Pinned words are fixed to the pinned item; **block building is done around them**: pinned runs become their own blocks, and automatic placement runs only on the words no pin covers. So the 20 s pin inside a new 0-60 s block stays, and the other 40 s are placed automatically.
- **When words disappear or change.** If the fingerprint is found only partly, or not at all, the pin is **kept**, shown in the tree with a "needs re-check" badge at its old time range, and the user can re-assign, accept or delete it. A pin is never silently dropped and never silently applied to different text. Words that merely changed spelling through a correction keep their ids and are unaffected.
- **Corrected words** (transcript corrections) change text only, not times, so they never disturb a placement. The wording score uses the corrected text, so correcting a name can improve a re-sort.
- Moves have undo/redo for the session (same history idea as transcript edits); the pins layer is saved after each move.
- Deleting a meeting deletes `outline.json` with it. The outline text is never copied into the library index database (the index must not hold transcript-like text).
- **Where the file lives.** The library is the folder the user chose. Transcripts and audio are already stored there, so `outline.json` has the same property they have: it stays on this computer unless the user's chosen folder is synced by a service they run themselves (Dropbox, OneDrive, iCloud and the like), which then copies it as it copies the transcripts. Scribe itself uses no network for any of this. The plan's claims are limited to that.

## Unmatched dialog and unmatched headings

- **Dialog with no good heading** goes to **Not placed**, shown last, in time order. It is never dropped and always exported (as a final "Other discussion" section) so nothing in the transcript disappears from the grouped export.
- **Headings with no dialog** stay in the tree as "No discussion found", dimmed. In export they are listed with that note, or omitted by a checkbox (**Include headings with no discussion**, default on, so a missing topic is visible rather than hidden).
- A heading that wins only a few weak blocks is shown as Unsure, not as covered.

## Interaction with other features

- **Final pass.** Placement is allowed on live-only text but labelled "Preliminary, the final pass has not finished". When the final pass completes (`transcriptChanged` replace), automatic placements are marked outdated and the banner offers Sort again; it never re-sorts silently. Pins are re-applied by word range and fingerprint as described above, and any that cannot be found are flagged "needs re-check".
- **Live recording.** Out of scope: sorting runs on a stopped meeting only. (Showing the current heading during recording is a possible later feature, not planned.)
- **Corrections.** Described above. A word correction does not mark placements outdated; a segment replace does.
- **Summaries.** V1: no change. Summaries keep their own sections and are not marked outdated by placements. Possible later step, not planned: feed the outline headings to the summary as section hints.
- **Export.** Transcript options gain `groupByOutline`. DOCX and PDF: heading hierarchy as headings, dialog beneath each in time order with speaker and time per the existing options, Unsure blocks marked with a "(unconfirmed placement)" note when `showCorrections`-style marking is on (default on), then "Other discussion". If the Export dialog's content is "both", the summary is unchanged. **VTT stays time-ordered and unchanged**, because cues must be chronological; optionally a `NOTE` line carrying the heading can be written at the first cue of each item, behind the same checkbox. Slice 4 decides, default is to leave VTT alone.
- **Search.** The outline tab is not indexed in V1.

## UI and backend split, and the proposed contract change

Folder rule: UI in `apps/desktop/src/ui/`, backend elsewhere, no UI imports of backend modules.

- **Backend (separate PRs from the UI):**
  - New package `packages/outline`: `parse.ts` (parser), `blocks.ts` (blocks), `match.ts` (scoring and path), `pins.ts` (re-locating pins), with unit tests. Pure functions, no I/O.
  - `packages/storage`: `formats/outline.ts` and read/write beside the transcript file.
  - `apps/desktop/src/main`: handlers for the calls below.
  - `packages/export`: grouped renderers in DOCX and PDF.
- **UI:** the Outline tab, paste dialog with preview, tree view, move controls, export checkbox, the mock backend implementing the new calls exactly as the contract says.
- **Proposed contract change (needs owner approval; this plan does not edit `packages/contracts/`).** All names go through the existing single call channel and event channel and must be added to the allowlists in preload and main and to the contract tests:

```ts
interface OutlineItem { id: string; level: number; text: string; ownerName?: string }
interface OutlineBlock {
  startMs: number; endMs: number; speakerId: SpeakerId;
  segmentIds: SegmentId[];
  itemId: string | null;            // null = Not placed
  confidence: 'likely' | 'unsure' | 'confirmed';
}
interface OutlineView {
  meetingId: MeetingId;
  items: OutlineItem[];
  blocks: OutlineBlock[];
  state: 'none' | 'sorting' | 'ready' | 'outdated';
  preliminary: boolean;             // final pass not done
}
calls:
  parseOutline:  { request: { text: string }; response: { items: OutlineItem[]; notes: string[] } }  // stateless preview
  saveOutline:   { request: { meetingId; items: OutlineItem[] }; response: void }                    // starts a sort
  getOutline:    { request: { meetingId }; response: OutlineView | null }
  placeBlocks:   { request: { meetingId; firstWordId: WordId; lastWordId: WordId; itemId: string | null }; response: OutlineView } // creates a pin
  splitBlock:    { request: { meetingId; atWordId: WordId }; response: OutlineView }
  clearOutline:  { request: { meetingId }; response: void }
  cancelSort:    { request: { meetingId }; response: void }
events:
  outlineChanged: { meetingId: MeetingId }       // after sort finish, pin, or outdated
types: TranscriptExportOptions gains groupByOutline: boolean and includeEmptyHeadings: boolean
```

  Errors use only the existing codes (`ContractErrorCode`: `invalidRequest`, `notFound`, `conflict`, `diskFull`, `internal`, ...): `notFound` for a missing meeting, `conflict` while recording or finalising, `invalidRequest` for empty or over-long text. There is no `cancelled` code; cancelling a sort ends it silently with `state` back to `none` or the previous result, and no new code is proposed. The mock must reject exactly what the real handler rejects.
  - `OutlineItem.ownerName` is the typed name string, not a `SpeakerId`; speakers appear only per block (`OutlineBlock.speakerId`), after sorting.
  - `OutlineView` also carries `pins: { id; startMs; endMs; itemId: string | null; status: 'ok' | 'needsRecheck' }[]` (the sketch's `placeBlocks` already takes a word range).
  - **Export flags are backward compatible:** `groupByOutline?: boolean` and `includeEmptyHeadings?: boolean` are optional fields on `TranscriptExportOptions`; absent means `false` and `true` respectively, so existing callers, saved settings and the mock keep working unchanged. The validator must accept requests with and without them. A **possible simplification** if the owner prefers fewer contract additions: drop `parseOutline` and `splitBlock` (do the preview in the UI with a copy-free shared pure parser in `packages/contracts` only if the owner allows code there; otherwise keep `parseOutline`). Recommendation: keep all as listed; it is small and keeps the parser out of the UI.

## Test plan (invented data and AMI fixtures only; never the owner's recordings)

- **Pin survival (data integrity):** a 20 s pin at 20-40 s stays exactly 20-40 s after a re-cut into a 0-60 s block; pin survives words re-timed, split or merged segments, and a full final-pass replace with new word ids (found by fingerprint); pin whose words are removed or heavily changed is kept and flagged `needsRecheck`, never dropped and never moved to other text; pins never lost across save and reload; auto placement runs only on unpinned words.
- **Parser unit tests:** Markdown headings, numbered 1 / 1.1 / A., bullets and indentation, mixed, tabs, blank lines, trailing `(Name)`, 200-item cap, empty and oversized text.
- **Blocks:** pauses split, long block split, speaker change, tiny blocks.
- **Matcher unit tests on invented transcripts:** perfect-order meeting; one topic jumped back to; skipped heading; heading never discussed; off-topic chat (stays Not placed); filler ("yeah") stays inside its topic; two headings with similar words; owner bonus helps but never alone; pins win over auto; determinism (same input, same output).
- **AMI evaluation (the accuracy test):** use the AMI fixtures already in the repo for gate tests (confirm which have the corpus topic annotations; AMI provides topic segmentation for its scenario meetings). Build the outline from the topic labels; compute below. If a fixture lacks annotations, write the reference by hand from its reference transcript. Also generate harder variants: shuffle two topics (jump-back), delete a heading, add an extra unrelated heading.
- **Handler tests in `apps/desktop/src/main`:** `notFound`, `conflict` while recording, `invalid`, nothing written on failure, pins survive a re-sort, final-pass replace marks outdated.
- **Contract tests:** new names in both allowlists, validation rejects bad requests, mock matches contract.
- **Storage tests:** `outline.json` round trip, versioning, deleted with the meeting, never in the index DB.
- **Export tests:** grouped DOCX/PDF contain every transcript block exactly once; Not placed appears; empty-heading option; VTT unchanged.
- **UI tests on the mock:** paste, preview and fix a level, sort, move by keyboard and by drag, split, undo, outdated banner, tokens-only colours, contrast.
- **Performance:** 2-hour transcript (about 500 blocks) against 60 items finishes under 2 seconds for Level A; run in a worker so the UI never blocks.

## Accuracy: honest expectation and how to measure it

**Expectation (estimates, not measurements):** for a meeting that follows its outline with distinct headings, Level A should file roughly 70 to 85 percent of the dialog (by time) under the right heading; the order prior fixes most single-word ambiguity. For vague headings ("Updates", "AOB"), meetings that jump around, or heavy small talk, expect 50 to 65 percent. Level B might add 5 to 10 points on wording-mismatch topics. These numbers are guesses to be replaced by the AMI evaluation.

**Measure before shipping:**
1. **Time-weighted accuracy:** share of reference dialog time placed under the correct item (Not placed counts as wrong unless the reference also says off-topic).
2. **Placed-correct rate for "Likely" labelled blocks only** (this is the one that matters for trust).
3. **Unsure/Not-placed share** (so the app does not "win" by refusing everything).
4. **Boundary error:** median distance in seconds between true and found topic changes.
5. Results split by variant (in order, jump-back, deleted heading, extra heading) and by transcript source (live text versus final-pass text).

**Proposed ship bar (owner to confirm):** Likely-labelled placements at least 90 percent correct, overall time-weighted accuracy at least 70 percent on in-order AMI meetings, and no variant below 50 percent. If Level A misses it, try Level B once; if it still misses, ship nothing, or ship only with every block shown as Unsure.

## Slices

| # | Slice | Hours | Notes |
| - | ----- | ----- | ----- |
| 1 | Offline engine and evidence (nothing visible in the app): `packages/outline` parser, blocks, Level A matcher, pin re-location, constants, the summary export line, AMI evaluation harness and report | 20 | Pure functions; no contract change; yields the accuracy numbers first |
| 2 | Contract additions (approval), storage `outline.json`, handlers, mock backend | 10 | Backend and mock on opposite sides of the folder line |
| 3 | Outline tab UI: paste and preview, tree view, confidence badges, banners | 12 | After slice 2 |
| 4 | Moves, pins, split, undo, re-sort keeps pins, outdated after final pass; grouped DOCX/PDF export (and the VTT decision) | 14 | |
| 5 | Optional: .docx input (5 h); Level B model (12 h, separate approval); Level C | 5 to 17 | Only if the numbers or the owner call for them |

Slice 1 can start before any approval beyond the plan, because it touches no contract. Total for slices 1 to 4: about 56 hours (range 45 to 70). Plan review and owner approval are not counted. Work is split so each PR stays on one side of the UI/backend line.

## Risks

| Risk | Handling |
| ---- | -------- |
| Wrong placement looks like fact | Confidence labels, "Automatic" banner, weak ones stay Not placed, export marks unconfirmed placements, every block movable |
| Outline private content | Stored only in the meeting folder in the user's library (same as transcripts, so a user-synced library folder syncs it too); never logged, never in the index DB; Scribe makes no network use; Level C stays on-device |
| Over-trust of order prior makes a jump-back wrong | Jump-back is allowed with a modest cost; AMI variants test it |
| Vague headings ("Misc") | Expected weak; low confidence rather than forced placement |
| Final pass changes the text under a placement | Marks outdated, asks before re-sorting, pins re-applied by time |
| New model (Level B) adds size, licence and platform risk | Separate owner approval; only if Level A fails the bar |
| Scope growth | Post-meeting only; no live use, no summary coupling, no import beyond text in V1 |
| User moves lost on re-sort or final pass | Pins are word-range based, separate from blocks, re-located by id then fingerprint, flagged "needs re-check" if not found; pin-survival tests above |

## Relation to #131 and where it belongs

#131 (fix words from typed notes) and this plan are independent features. If both are approved, share one **Notes** button that opens a paste box with two choices ("Fix misheard words" and "Use as outline") so the user sees one concept; the two matchers do not share code beyond the tokeniser. Neither is on the M1 path. Recommendation: schedule slice 1 after M1 as a measurement step; build slices 2 to 4 only if the owner approves the accuracy it reports.

## Agent usage log

Authored by Claude Code (Sonnet 5.5), Mac, planning only. One row is added as a new file in `agents/usage-log/`. Independent review: **pending**.
