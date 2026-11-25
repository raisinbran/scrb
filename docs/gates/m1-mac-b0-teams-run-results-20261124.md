# Mac B0 over a Teams call: results, two runs (2026-11-24)

Candidate: the installed release candidate (`/Applications/Scribe.app`, built from main 63749688), launched on isolated temp profiles and libraries with the B0 scripts; the owner's library was never opened by the app (checked with `lsof` on every launch). Kit and rules: [m1-mac-b0-teams-call-kit-20261124.md](m1-mac-b0-teams-call-kit-20261124.md). The owner approved this Teams-routed run as B0 evidence for cells 1, 2, 3, 5 and persistence (cell 4 not covered) and approved counting speaker bleed as attribution errors and reporting it separately. Raw audio, transcripts and the screen videos stay in `~/scrb-b0-teams-20261124` (run 1) and `~/scrb-b0-teams2-20261124` (run 2), not committed.

## Result by cell

| Cell                          | Run 1 (same room)                                      | Run 2 (two rooms)                                                                                                                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks     | NOT VERIFIED: end beep missing in the microphone track | **PASS** on offsets (40 ms start and end), drift (0 ms) and chunk gaps (none on either track). The bleed sub-limit (other-track energy under 10%) is **NOT MET** with speakers on. M1 proceeds by owner instruction 2026-11-24; product gap tracked in issue #487 (raisinbran/scrb) |
| 2 Live text, three voices     | NOT VERIFIED: stimulus invalid                         | **WAIVED by owner decision 2026-11-24 for M1; not measured, not a PASS.** The run-2 video never showed the Live window during the 30 turns (separate scoring write-up, draft PR 486)                                                                                                |
| 3 Final text, distinct voices | NOT VERIFIED: stimulus invalid                         | **PASS** under the frozen rules: three speaker ids, 30/30 recognizable, Y 10/10, A 10/10, B 10/10, A and B not merged                                                                                                                                                               |
| 4 Audible seek                | NOT RUN                                                | not run, M1 proceeds by owner instruction 2026-11-24                                                                                                                                                                                                                                |
| 5 Clipboard parity            | not done                                               | **PASS** by owner decision 2026-11-24 on the clipboard evidence (42 sections and 240 words identical to `transcript.json`). The offscreen screenshot step was not taken and stays a documentation gap                                                                               |
| Persistence                   | not done                                               | **PASS** (automated, see below): relaunch on the isolated profile and library, `transcript.json` byte-identical (SHA-256 3c6dec99...), meeting opens with labels, both tracks play and one seek lands where asked                                                                   |

## Run 1 (same room): why it was invalid

- The owner's Y lines reached the meeting track through PC2's microphone (same room), where Scribe labelled them as a remote speaker ("Speaker 1"); the Mac microphone track held only fragments. Four speaker ids appeared. The start beep was in both tracks (40 ms apart) but the end beep was missing in the microphone track, and the "garden clock" line was lost from the call audio (digital silence in the meeting track). Output volume read 6% after the run (set to 30%; cause unknown).
- This is a kit design flaw, incident A-1142. No score from run 1 is used.
- The first preflight of run 1 (nothing reached the Mac) and the first preflight of run 2 (recording started after the beep) failed on setup; they are environment findings, not product results.

## Run 2 details

- Tracks: `b0-track-sync.mjs` found beeps at 53.53 s and 325.71 s (microphone) and 53.49 s and 325.67 s (meeting); first-to-last spacing 272.2 s, as expected. Chunk gaps: none (maximum gap about 0 ms on both tracks). Recording 334.7 s.
- Cell 3 mapping, frozen before scoring (`mapping-final.json`): speaker-1 = B, speaker-2 = A, you = Y. 3x3 table: all 30 turns on the diagonal (Y 10, A 10, B 10). Recognizable means at least 60% of the phrase's words in order inside the turn's window, found with the offset from the start beep; per-turn fractions 0.71 to 1.0. Word omission and extra counts were not tallied.
- Bleed (reported separately, counted as above): the final text holds about 14 short "You" fragments that repeat the start of a remote line (for example "The blue", "Seven smooth", "A red suitcase"); four such words fall inside the scored remote windows and do not change any per-turn result. Microphone-track level during remote turns is higher than during the owner's lines (about -25.9 dB against -33.6 dB, rough windows), so the run-sheet sub-limit that other-track energy stay under 10% of speech level is **not met** by this setup; speakers on is part of the kit design. Owner instruction 2026-11-24: not accepted as a product behavior, M1 proceeds; tracked in #487.
- Room noise: the microphone track floor is about -29 dB in silent gaps; the owner reports silent rooms, so this is probably input gain (input volume 100%), a measurement not a cause.
- Owner library: not opened by the app. Two `.DS_Store` files in it changed at 18:16, which looks like Finder; no other file changed after 14:10.

## Cell 5 re-check (clipboard)

The pasted text and the text rebuilt from `transcript.json` with the `copy-transcript.ts` rule are identical: 42 sections and 240 words in both (1,780 characters). The product test `CopyTranscriptAction.test.tsx` ("copies all 4,800 segments with labels, corrected words, and chronological order") shows the copy covers every segment, not only loaded rows. The Live pane in the only Scribe screenshot taken (`scribe-now.png`) shows about 12 text lines of transcript area, so 42 sections could not have been on screen at once, and the owner reports about 100 rows. What is missing is the frozen rule's own evidence: a screenshot of the meeting's transcript pane taken at copy time showing rows out of view. The only screenshot from the copy moment shows another application. The substance (full-length parity) is shown; the offscreen screenshot is a documentation step, so the owner may accept the cell as PASS on this reasoning, but this document does not re-score it.

## Persistence check (Playwright, one attempt)

Owner decision 2026-11-24: one bounded automated attempt. The installed `Scribe.app` was launched through Playwright's Electron launcher with `--user-data-dir=<run-2 profile> --scrb-isolated-test-profile`. `lsof` showed no open file under the owner library, and the app listed the run-2 meetings. A test-only `Audio` spy was added to the page (as `e2e/playback.spec.ts` does); the app was not changed.

- Meeting "20261124 Meeting", 7:10 PM, 6 min, 3 speakers (the run-2 recording) opened on the Transcript tab. Labels You, Speaker 1 and Speaker 2 with 24 timestamp buttons, for example "Play from 00:57", "A copper lantern marks the quiet doorway."
- "Play from 00:57": microphone and meeting audio both playing, same position (3.8 s into chunk 11), no error, ready state 4. 4 s later both were in chunk 12 at 1.32 s, so playback advanced and stayed in step.
- "Play from 02:17": both tracks jumped to chunk 27 and played from 4.72 s after 2 s, in step, no error. That is about 02:17, so one seek landed where asked.
- `transcript.json` SHA-256 unchanged after all of it.

Screenshots: `persist-3-playing.png`, `persist-4-seek.png` in the run-2 evidence folder (not committed). This is automation, not an owner listening test, and it says nothing about audible quality (that is cell 4).

## What remains of M1 B0 (Mac column)

Cell 1 PASS on offsets, drift and gaps with the bleed sub-limit NOT MET (M1 proceeds by owner instruction 2026-11-24; product gap tracked in issue #487 (raisinbran/scrb)). Cell 2 WAIVED. Cell 3 PASS. Cell 4 not run, M1 proceeds by owner instruction 2026-11-24. Cell 5 PASS by owner decision. Persistence PASS (automated). Nothing is left to run for the Mac column except what those owner decisions set aside.

## Open items for the owner

1. Input volume 100% and the output volume that read 6% after run 1 are not explained.
2. The speaker bleed into the microphone track is tracked in #487.
