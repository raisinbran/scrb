# Punctuation and capitalisation missing in some final transcripts (2026-11-25)

**Result: not a code bug in assembly or export, and not reproduced with the current build. No code changed.** Numbers only; no transcript text, names or audio are in this note. All work was on copies in the OS temp directory; the library was only read.

## What the stored transcripts show

Sentence-ending marks (`.?!`) per 1000 words in the stored final words, per track (transcripts in the library with 200+ words per track):

| Recording | Meeting track | Mic track |
| --- | --- | --- |
| 11-12 imported file (64 min) | **0** | n/a |
| 11-13 to 11-16 (7 recordings) | 21 to 133 | 22 to 158 |
| 11-17 (5) (43 min) | **0** (capitalised 14 per 1000) | 118 |
| 11-23 (40 min) | 68 | n/a |
| 11-24 (2) (12 min) | 81 | n/a |
| 11-24 (61 min, the reported one) | **0** (first 60 min, every 10-minute bucket) | 140 |

So the loss is whole-track (every 10-minute bucket is zero), only on the meeting track, in 3 of the 6 recordings over 40 minutes, and not tied to length, edit count (the import has no edits) or date. The live transcript is not kept after the final pass, so the live-versus-final comparison (step 1) cannot be made.

## What was ruled out

- **Assembly and join code.** `parseWords` keeps the whole segment text; `-ml 1 -sow` keeps punctuation attached to the word (also shown by `docs/handoffs/punctuation-final-pass-check-20261113.md`). `toModelReplacement`, export and the transcript view only join `word.text`. No step strips punctuation or lowercases stored words (`bare()` is used only for matching).
- **Vocabulary hint / `-mc 128`.** The library had one 3-character term from 11-14 and a second from 11-25. Decoding the 11-24 meeting track (copy, current `whisper-cli`, `large-v3-turbo-q5_0`, Silero VAD, `-ml 1 -sow`):

| Run | Words | Sentence ends per 1000 |
| --- | --- | --- |
| Full 61 min, `-mc 0`, no hint | 7603 | 49 |
| Full 61 min, `-mc 128`, current hint | 7475 | 71 |
| 3 min, `-mc 128`, the 3-character term | 259 | 84 |
| 3 min, `-mc 128`, invented 3-character term | 256 | 85 |
| 3 min, `-mc 0` | 290 | 27 |

Every run is punctuated in every 10-minute bucket (10 to 135 sentence ends per bucket). The stored transcript for the same audio has 0.

## Conclusion and open question

With today's settings the same audio decodes with normal punctuation, with or without a hint. The three unpunctuated passes were therefore produced by something that no longer applies or that I cannot see: an earlier app build or `whisper-cli` (the installed app was rebuilt 2026-11-24 20:15, after the 11-24 recording), or a non-deterministic whisper collapse into an unpunctuated mode. The 11-12 import predates the hint, so the hint is not the single cause. Regression date: not established, because earlier builds are not available to rerun; the first affected recording is 11-12.

Note: the owner-supplied quote ("Hey, good morning, everyone. Morning.") matches the 11-24 (2) recording, which is punctuated (81 per 1000).

## Options (not built)

1. **Re-run:** reprocessing an affected recording with the current build likely restores punctuation (all four decodes above did). Cheapest; one reprocess of the 11-24 recording would confirm it on the real pipeline.
2. **Detect and warn:** after the final pass, if a meeting-track has fewer than about 5 sentence ends per 1000 words over 500+ words (every normal recording above is 21 or more), log an event and offer an automatic re-decode. Small, backend only.
3. **Punctuation restoration pass** (a small punctuation/truecasing model) as a fallback for such tracks. Larger, needs a model and a licence check.
4. **`-mc` setting:** not indicated by this data; the parallel vocabulary sweep owns the `-mc` question.
