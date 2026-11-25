# Mac B0 over a Teams call: results, two runs (2026-11-24)

Candidate: the installed release candidate (`/Applications/Scribe.app`, built from main 63749688), launched on isolated temp profiles and libraries with the B0 scripts; the owner's library was never opened by the app (checked with `lsof` on every launch). Kit and rules: [m1-mac-b0-teams-call-kit-20261124.md](m1-mac-b0-teams-call-kit-20261124.md). The owner approved this Teams-routed run as B0 evidence for cells 1, 2, 3, 5 and persistence (cell 4 not covered) and approved counting speaker bleed as attribution errors and reporting it separately. Raw audio, transcripts and the screen videos stay in `~/scrb-b0-teams-20261124` (run 1) and `~/scrb-b0-teams2-20261124` (run 2), not committed.

## Result by cell

| Cell                          | Run 1 (same room)                                      | Run 2 (two rooms)                                                                                                                                                                                          |
| ----------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks     | NOT VERIFIED: end beep missing in the microphone track | **PASS**: offsets 40 ms start and end, drift 0 ms, no chunk gap on either track                                                                                                                            |
| 2 Live text, three voices     | NOT VERIFIED: stimulus invalid                         | **NOT VERIFIED**: screen video recorded but not analysed (no time budget left); no live figure is claimed                                                                                                  |
| 3 Final text, distinct voices | NOT VERIFIED: stimulus invalid                         | **PASS** under the frozen rules: three speaker ids, 30/30 recognizable, Y 10/10, A 10/10, B 10/10, A and B not merged                                                                                      |
| 4 Audible seek                | NOT RUN                                                | NOT RUN                                                                                                                                                                                                    |
| 5 Clipboard parity            | not done                                               | **NOT VERIFIED**: pasted text equals the text rebuilt from `transcript.json` (42 sections, no difference), but offscreen coverage was not shown (no screenshot of the Scribe window with rows out of view) |
| Persistence                   | not done                                               | **NOT VERIFIED** (partial): `transcript.json` hash identical after quit and relaunch on the same profile; playback, a seek and the labels check on screen were not done                                    |

## Run 1 (same room): why it was invalid

- The owner's Y lines reached the meeting track through PC2's microphone (same room), where Scribe labelled them as a remote speaker ("Speaker 1"); the Mac microphone track held only fragments. Four speaker ids appeared. The start beep was in both tracks (40 ms apart) but the end beep was missing in the microphone track, and the "garden clock" line was lost from the call audio (digital silence in the meeting track). Output volume read 6% after the run (set to 30%; cause unknown).
- This is a kit design flaw, incident A-1142. No score from run 1 is used.
- The first preflight of run 1 (nothing reached the Mac) and the first preflight of run 2 (recording started after the beep) failed on setup; they are environment findings, not product results.

## Run 2 details

- Tracks: `b0-track-sync.mjs` found beeps at 53.53 s and 325.71 s (microphone) and 53.49 s and 325.67 s (meeting); first-to-last spacing 272.2 s, as expected. Chunk gaps: none (maximum gap about 0 ms on both tracks). Recording 334.7 s.
- Cell 3 mapping, frozen before scoring (`mapping-final.json`): speaker-1 = B, speaker-2 = A, you = Y. 3x3 table: all 30 turns on the diagonal (Y 10, A 10, B 10). Recognizable means at least 60% of the phrase's words in order inside the turn's window, found with the offset from the start beep; per-turn fractions 0.71 to 1.0. Word omission and extra counts were not tallied.
- Bleed (reported separately, counted as above): the final text holds about 14 short "You" fragments that repeat the start of a remote line (for example "The blue", "Seven smooth", "A red suitcase"); four such words fall inside the scored remote windows and do not change any per-turn result. Microphone-track level during remote turns is higher than during the owner's lines (about -25.9 dB against -33.6 dB, rough windows), so the run-sheet sub-limit that other-track energy stay under 10% of speech level is **not met** by this setup; speakers on is part of the kit design. Whether that excludes cell 1 is the owner's call (open item 1).
- Room noise: the microphone track floor is about -29 dB in silent gaps; the owner reports silent rooms, so this is probably input gain (input volume 100%), a measurement not a cause.
- Owner library: not opened by the app. Two `.DS_Store` files in it changed at 18:16, which looks like Finder; no other file changed after 14:10.

## Open items for the owner

1. Does the bleed sub-limit (above) block cell 1 as B0 evidence, or is the speakers-on kit accepted as is?
2. Cell 2 (live text) needs the run-2 video analysed: a further agent task, not a rerun.
3. Cell 5 and persistence need one more short session each with the Scribe window in front (copy with rows offscreen shown; one seek and playback after a restart).
4. Cell 4 (seek) is not covered by this kit.
5. Input volume 100% and the output volume that read 6% after run 1 are not explained.

Usage: Claude Code, Sonnet 5.5, Mac desktop. Start 18:11 PST: 5-hour limit 69% used, weekly 32% used. Run 2 started at about 18:52 with 5-hour 8% (a new window) and weekly 35%; end about 19:25 with 5-hour 12% and weekly 36% (the session's own share is not separable from other sessions).
