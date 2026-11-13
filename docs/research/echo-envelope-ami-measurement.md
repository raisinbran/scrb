# Final-pass room echo: loudness and fuzzy matching, AMI simulation

Measured with `packages/transcription/scripts/echo-sim.ts` (`npx tsx scripts/echo-sim.ts <meeting> <seed> 840`, from `packages/transcription`). Only AMI audio and AMI word annotations are used.

## Setup (simulated, not a real room)

- Meeting track: first 840 s of an AMI mix (ES2004a or TS3003a). Meeting transcript: the AMI annotation with 4% of words replaced.
- User: IS1009a speaking in 8 s windows every 40 to 50 s, mixed into the mic at the same time as the meeting is playing (about 68% of user words overlap meeting speech).
- Mic audio: meeting through 14 sparse reflections, 140 ms delay, scaled so the echo is 12, 6 or 0 dB below the user's speech RMS, plus faint noise.
- Mic transcript (invented recogniser model): of echoed words 72% exact, 13% near spelling (last letter dropped or "s" added), 7% another word, 8% missing; timing jitter 50 ms. Outside the user's windows only echo words are in the mic text; inside them only user words.
- 3 seeds x 2 meetings. Thresholds were set on ES2004a seed 1 and then checked on the other five runs (TS3003a is hold-out).

## Result (mean of 6 runs; user words: sum over 6 runs, 2034 total, 1387 overlapping meeting speech)

| Echo vs user level | Echoed words dropped: before | text fuzzy only | after (fuzzy + loudness) | User words dropped: before | fuzzy only | after |
| ------------------ | ---------------------------- | --------------- | ------------------------ | -------------------------- | ---------- | ----- |
| 12 dB below        | 67.4%                        | 75.4%           | **87.3%**                | 8                          | 10         | 10    |
| 6 dB below         | 67.4%                        | 75.4%           | **87.3%**                | 8                          | 10         | 11    |
| equal (0 dB)       | 67.4%                        | 75.4%           | **87.3%**                | 8                          | 10         | 37    |

Gain: about +20 points of echoed words (+8 from fuzzy text, +12 from loudness). "Before" is lower than the 81% in the earlier plan because this error model hears 28% of echo differently or not at all; the gain, not the absolute level, is the comparable figure.

## False drops, stated plainly

- The text rule already drops a few real user words (8 of 2034 before): a user saying the same words as the meeting at the same moment. Fuzzy matching adds 2 more.
- Loudness adds 1 more when the user is 6 dB or more louder than the echo (the normal case: mouth near the mic).
- When the user is only as loud as the echo (0 dB, worst case for this test) loudness drops 27 more user words (1.3% of user words, 2.0% of those overlapping meeting speech). The level check (a word more than 6 dB off the room's echo gain is kept) cannot separate them there by construction.
- Loudness never acts when the recording shows no echo (no estimable delay): headset recordings are unaffected.

This is a simulation with an invented recogniser error model and an invented room; real whisper output on a real room is not measured here.
