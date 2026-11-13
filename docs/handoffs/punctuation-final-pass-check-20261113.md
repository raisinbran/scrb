# Final-pass punctuation check (2026-11-13)

**Result: not reproduced in this test. No code changed.**

Suspicion: with `-ml 1 -sow -ojf`, `parseWords` (`packages/transcription/src/whisper.ts`) might emit punctuation-only or sub-word segments as separate words, or lose them.

## Evidence

Ran the shipped final-pass flags (`large-v3-turbo-q5_0`, Silero VAD, `-mc 0 -ml 1 -sow -ojf`) on 180 s of AMI `ES2004a.Mix-Headset` (offset 60 s; about 9 s run).

- 508 JSON segments.
- 0 punctuation-only segments.
- 87 segments end in punctuation, attached to the word (` whiteboard.`, ` So,`, ` okay,`, ` blue.`).
- Contractions stay whole (` it's`, ` we're`).
- 7 segments lack a leading space; all are empty `[_BEG_]` segments, already dropped by `parseWords`.

With `-sow`, whisper.cpp starts a new segment only at a token with a leading space, so punctuation and sub-word pieces stay inside the word's segment. `parseLiveWords` needs its merge only because the live server reports raw token pieces; the final pass does not.

Not covered: one 3-minute clip, one model. The owner's recordings were not used. Any punctuation gap in real transcripts is more likely the model's own output (for example in fast overlapping speech) than parsing.
