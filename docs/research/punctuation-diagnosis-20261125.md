# Punctuation and capitalisation missing in some final transcripts (2026-11-25)

**Result: historical cause unknown. The current decoder did not reproduce the loss on a copy of the audio, and no stripping was found in the reviewed assembly and export code. The full app pipeline was not re-run. No code changed.** Numbers only; no transcript text, names or audio are in this note. All work was on copies in the OS temp directory; the library was only read.

## What the stored transcripts show

Sentence-ending marks (`.?!`) per 1000 words in the stored final words, per track (transcripts in the library with 200+ words per track; "(n)" is the library's suffix for the n-th recording of that day, so "11-17 (5)" is the fifth 11-17 recording; the two 11-24 rows are different recordings of 12 and 61 minutes):

| Recording | Minutes | Meeting track | Mic track |
| --- | --- | --- | --- |
| 11-12 imported file | 64 | **0** | n/a |
| 11-13 (3) | 3 | 73 | 48 |
| 11-13 (5) | 72 | 21 | 22 |
| 11-13 (6) | 1 | 122 | n/a |
| 11-13 (7) | 13 | 60 | 85 |
| 11-14 (2) | 3 | 59 | n/a |
| 11-15 (2) | 4 | 133 | n/a |
| 11-16 | 68 | 86 | 158 |
| 11-17 (5) | 43 | **0** | 118 |
| 11-23 | 40 | 68 | n/a |
| 11-24 (2) | 12 | 81 | n/a |
| 11-24 (the reported one) | 61 | **0** | 140 |

So the loss is whole-track (every 10-minute bucket is zero), only on the meeting track, in 3 of the 6 recordings of 40 minutes or longer (11-12, 11-13 (5), 11-16, 11-17 (5), 11-23, 11-24), and not tied to length, edit count (the import has no edits) or date. The live transcript is not kept after the final pass, so the live-versus-final comparison (step 1) cannot be made.

## What was checked

- **Assembly and join code.** `parseWords` keeps the whole segment text; `-ml 1 -sow` keeps punctuation attached to the word (also shown by `docs/handoffs/punctuation-final-pass-check-20261113.md`). `toModelReplacement`, export and the transcript view only join `word.text`. No step strips punctuation or lowercases stored words (`bare()` is used only for matching). This is a code review of the current tree, not a replay of the older builds.
- **Vocabulary hint / `-mc 128`.** The library had one 3-character term from 11-14 and a second from 11-25. Decoding the 11-24 meeting track on a copy with the `whisper-cli` bundled in the installed app (rebuilt 2026-11-24 20:15), `ggml-large-v3-turbo-q5_0`, Silero v6.2.0 VAD, `-t 4 -l en -ml 1 -sow`; hinted runs used `--prompt <terms> --carry-initial-prompt -mc 128` (the repo's `wholeFileArgs`), others `-mc 0`. This ran `whisper-cli` directly, not the app's `finalPass` or diarization:

| Run | Words | Sentence ends per 1000 |
| --- | --- | --- |
| Full 61 min, `-mc 0`, no hint | 7603 | 49 |
| Full 61 min, `-mc 128`, current hint | 7475 | 71 |
| 3 min, `-mc 128`, the 3-character term | 259 | 84 |
| 3 min, `-mc 128`, invented 3-character term | 256 | 85 |
| 3 min, `-mc 0` | 290 | 27 |

The two full 61-minute runs have 10 to 135 sentence ends in every 10-minute bucket; the 3-minute runs are not bucketed and are punctuated overall (27 to 86 per 1000). The stored transcript for the same audio has 0.

## Conclusion and open question

**Established:** the stored meeting tracks of three recordings have no sentence punctuation; the current decoder, with and without the hint, punctuates the same audio; the reviewed assembly, export and view code does not strip punctuation.

**Not established:** why the stored passes lack it. The tool, model and flags of those historical passes are unknown (the app build and `whisper-cli` that ran them are not available; the hint at that time may have been the single 3-character term, but no log records it). Candidate causes still open: an older `whisper-cli` or build, the hint or `-mc 128` carry in some historical state, or a non-deterministic collapse into an unpunctuated mode. The 11-12 import predates the hint feature, which argues against the hint alone, not against context carry in other builds.

**What would settle it:** one separately approved, bounded reprocess of the 11-24 recording in the real app (preserving the original and its edits), plus recording the whisper arguments and `whisper-cli` identity per final pass in the log so a future occurrence is attributable. Nothing here shows that reprocessing restores punctuation in saved final output; the decodes above are direct `whisper-cli` runs.

## Options (not built)

1. **Reprocess:** the five decodes above were all punctuated, so a reprocess may restore it, but this is unproven on the real pipeline. Needs owner approval.
2. **Detect and warn:** after the final pass, if a meeting track has fewer than about 5 sentence ends per 1000 words over 500+ words (every normal track above is 21 or more), log an event and offer a re-decode. Small, backend only.
3. **Log provenance:** record `whisper-cli` identity and arguments per pass.
4. **Punctuation restoration pass** (small punctuation/truecasing model) as a fallback. Larger; needs a model and a licence check.
5. **`-mc` setting:** not indicated by this data; the parallel vocabulary sweep owns that question.
