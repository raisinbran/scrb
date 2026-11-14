# Speaker separation and playback follow-along: diagnosis (2026-11-14)

Anonymized. Only counts, durations in aggregate and similarity scores appear here; no text, names or exact timings from the owner's recordings. Scratch copies were used and deleted.

Recordings examined (owner exception, 2026-11-14): R1, a 72-minute meeting, and R2, a 13-minute meeting, both from 2026-11-13.

## A. Remote speakers not separated

### Findings

1. **The final pass does run diarization on the meeting track in the real build, and it can separate several remote voices.** R1's stored transcript has five remote speakers plus "You". Re-running current main's final-pass diarization on R1's meeting track reproduces the same five speakers (about 18, 13, 12, 5 and 3 minutes of speech). Before merging, R1 had 7 raw clusters of 30 s or more; between different voices cosine similarity was 0.12 to 0.51, and the two pairs at 0.88 and 0.91 were one voice split in two and were correctly merged. The pipeline and config (`final-pass.json`: pyannote 3.0 int8 segmentation, eres2net embedding, sidecar built 2026-11-12) are intact.
2. **R2 is the "one Speaker 1" case, and it does not reproduce.** The stored R2 transcript has one remote speaker holding all 453 meeting words in a single 643 s turn. The meeting audio contains about 156 s of speech. Current main run on a copy of that audio gives two speakers (121 s and 36 s, cosine similarity between them 0.46, merge line 0.65), and the second voice owns 119 of the 453 words. The result is identical at 1, 2, 4 and 8 threads, so it is not nondeterminism. No user edits exist in R2 (no overrides, merges or undo history). The code in `finalPass.ts` and `speakers.ts` was unchanged between the recording and now (last change 2026-11-12). So the stored result came from something I cannot see: a different config, model file or sidecar at that moment, or a later manual speaker merge that left no trace. **Nothing is persisted from a final pass** (the library log has no final-pass event and the work folder is deleted), so this cannot be settled from the recording.
3. **Pipeline check on AMI (first 15 minutes each):** ES2004a gives 4 speakers (true 4), IS1009a gives 4 (true 4, one noisy extra cluster merged), TS3003a gives 2 (true 4). Cosine between true different voices is mostly 0.2 to 0.5; the two TS3003a clusters score 0.91, so segmentation or embedding already treats them as one voice and no merge threshold can recover them. In IS1009a one pair scores 0.87 and one 0.60. This is the known weak spot, not a regression.
4. **Short remote participants are absorbed by design.** `relabelClusters` folds any cluster under 30 s of speech (`minSpeakerMs = NAMED_AFTER_MS`) into its nearest larger speaker, whatever the similarity. R2's second voice cleared that limit by 6 s. A remote participant who speaks for less than 30 s in total always collapses into "Speaker 1". This is a plausible real cause of "everything from the meeting app is Speaker 1" in short or lopsided meetings.
5. **Live vs final:** only final-pass transcripts remain on disk (every segment is `pass: final`), so live attribution could not be compared with final. Not verified.

### Ranked smallest fixes

| # | Fix | Contract change | Owner approval | Cost |
|---|-----|-----------------|----------------|------|
| 1 | Write one log line per final pass: clusters before and after relabel, speech seconds per cluster, closest pair similarity, config model file names. No audio or text. Next time a meeting shows one speaker the cause is readable. | No | No (logging only, backend) | Small, under 1 hour |
| 2 | Lower `minSpeakerMs` from 30 s to about 10 s but keep a similarity guard (absorb only if similarity to the nearest speaker is at or above about 0.5). Evaluate on the three AMI meetings and R1/R2 numbers first. | No | Yes: it changes diarization behavior and needs the AMI run | Medium, 0.5 day |
| 3 | If #1 shows R2-style collapses with similarity under 0.5, raise sherpa's own clustering sensitivity for the meeting track (it runs at threshold 1.0 and merging is done after). | No | Yes | Medium; needs AMI and real-meeting evaluation |
| 4 | Segmentation or embedding collapse (the TS3003a case, similarity 0.91): no cheap fix; see `docs/research/overlap-aware-diarization-note.md`. | No | Yes | Large |

Not recommended: a "number of remote speakers" setting. `knownSpeakers` already exists in `RelabelOptions` but is not wired to the UI, and it needs a contract change and owner approval.

## B. Follow-along works only sometimes on older recordings

### Findings

1. **Data is not the problem.** All 13 library transcripts, old and new, have the same shape (schema version 2, same word fields, all words with start and end times, segments in start order with no inversions, no empty segments). Nothing is missing that follow-along reads.
2. **The old recordings do differ in one way that matters: very long turns.** R1 has segments up to about 35 minutes and 395 words, 10 segments over a minute; R2 has a 643 s, 453-word turn. A short recording from the same day has none over 11 s. Long turns come from collapsed diarization (A above): one speaker means one long row.
3. **UI defect (confirmed with a test): follow-along scrolls by row.** `TranscriptTab` scrolls the active row to the top when it is not fully inside the list. A row taller than the list can never be fully inside it, so the list scrolls to the row's top once and then never moves as playback advances through the turn. The highlighted word walks off the bottom of the view and nothing follows it. Short rows (new recordings, many speakers) work, which matches "sometimes".
4. Checked and fine: reduced motion only changes smooth to instant; the virtualized list renders the active row when offsets are right; the "reader scrolled" flag resets when playback restarts and the "Jump to current position" button resets it too. One limit remains, not fixed: after the reader scrolls during playback, follow stays off until that button or a pause and play. That is by design.

### Fix (implemented, separate commit)

When the active row is taller than the list, follow the current word instead of the row top (about 12 lines in `TranscriptTab.tsx`). Test `keeps the current word in view inside a row taller than the list` fails without the change and passes with it. No contract change, UI-only, no owner approval needed beyond normal review.

| # | Fix | Contract | Approval | Cost |
|---|-----|----------|----------|------|
| 1 | Follow the current word in rows taller than the list (done) | No | No | Done |
| 2 | Real-app check on a long-turn recording | No | No | 15 minutes by the owner |

## Cleanup

All scratch copies (audio, decoded WAVs, transcripts, span dumps) were deleted from the session scratchpad at the end. The library was only read.
