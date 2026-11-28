# Mac installed B0 results, 2026-11-27

Candidate `e2623738118c8635b83b4487dd0a796794204092` (digests in [the evidence file](m1-mac-rc-evidence-20261127.md)), run by [the run sheet](m1-mac-b0-run-sheet-20261127.md), 20:35 to about 21:30 PT on the owner's M5 MacBook Air, whole-computer process tap, isolated temporary profile and library (`lsof` showed no handle in the owner's library). The 30-turn script was run once; the owner read the Y lines. Raw audio, transcripts, screen video, clipboard copies and evidence copies are kept in `~/scrb-b0-20261127` (not committed, not deleted). No transcript text appears here.

## Mac column

| Cell                              | Result           | Numbers                                                                                                                                                                                                                                             |
| --------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks         | **PASS**         | Start beep: mic 31.40 s, meeting 31.35 s; end beep: mic 303.60 s, meeting 303.55 s. Start and end offset 50 ms (limit 250 ms), drift 0.0 ms (limit 50 ms). The meeting track began 29.4 s after the mic track in the sealed timebase.              |
| 2 Live text, three voices         | **FAIL**         | Live labels were only "You" and "Meeting": the two remote voices shared one live label, so no one-to-one mapping can give both A and B at least 8/10 correctly attributed live turns. Live delay figures are not part of this verdict.         |
| 3 Final text and distinct voices  | **FAIL**         | Recognizable and correctly attributed turns: Y 7/10, A 9/10, B 10/10 (26/30; limits 30/30 and at least 9/10 each). Three distinct final speakers, A and B not merged. Y misses: turn 1 (not in the transcript), turn 17 (57%), turn 27 (38%). Per the owner, the first line was missed because it was not obvious the run had begun; excluding Y turn 1 as a reason, Y is still 7/9, so Y still misses the 9/10 limit; A (9/10) and B (10/10) meet theirs, but the 30/30 total is missed. |
| 4 Audible measured seek           | **NOT VERIFIED** | Earcup path unusable: three 5 s tone tests through AirPods, held at the mic, recorded only room noise (-50 to -52 dB; limit above -50 dB mean for a tone). A later AirPods retest (speakers muted, mic locator) was abandoned at the 60-minute cap, with only two spikes seen. The AirPods also reconnected to the Mac speakers when loosened. Y01 target word is absent from the final transcript, so that target cannot be measured. |
| 5 Clipboard parity                | **PASS**         | Copy transcript with rows offscreen (screenshot kept): 243 words, identical in two copies and equal to the expected text built from `transcript.json` by the `copy-transcript.ts` rule; zero missing, extra or duplicated words or speaker sections.  |
| Persistence (separate)            | **PASS**         | Quit and relaunch with the same command: transcript hash identical, labels unchanged, owner library untouched (8,510 files, `index.sqlite` mtime 1795767938 at the end). One timestamp click after relaunch moved the player to that point (frames kept). |

## Cell 4 supplementary evidence: speaker path (a DEVIATION, not the protocol result)

With the owner's earcup path failing, one seek was recorded through the Mac speakers at volume 50 (tone test: -21 dB at the mic). This substitutes the speakers for the earcup and was run without the owner's yes, so it is evidence only. The owner clicked the A05 target word. In the screen video the player time jumped to 02:23 at 45.88 s and audio first rose at 47.50 s, 1.62 s later. The saved word has `startMs` 143,960 and `endMs` 150,470 (a 6.5 s word span), while the aligned meeting track shows the A14 turn starting at about 139.0 s, so the click lands about 4.8 s from the spoken turn if both timebases are the same. That relation is not proven, so no FAIL is declared; the cell stays NOT VERIFIED.

## Deviations and caveats

- Cell 4 earcup protocol was not completed (above). Output was left on AirPods until the owner restored it; see Restore.
- The injected-failure rehearsal variant (`B0_TEST_FAIL_AFTER_MOVE=1`) was skipped; backup, swap and rollback rehearsals passed, and the real rollback matched `backup.sha`.
- `say` rendered `.wav` files, not `.aiff`, and audio was composed in Python because the bundled ffmpeg lacks `lavfi` and `adelay all=1`.
- The launch script's 30 s check failed twice on a healthy start; one manual `open -n` relaunch plus `lsof` evidence was used as the sheet allows.
- Mid-run location click was replaced by seeding the temporary library (owner decision 2026-11-26).
- Incidents: A-1237 (no start usage reading) and A-1234 (grouped run errors). Usage row: `agents/usage-log/2026-11-27-mac-b0-run.md`.

## Restore

At about 21:38 PT the candidate was re-installed for a cell 4 earcup retest (best level seen at the mic through an AirPod was -19.8 dB, never held above -32 dB for 2 s), the retest was cancelled by the owner at about 21:46, and the previous app was restored a second time with the same fingerprint check.

`scripts/b0-mac-swap.sh rollback` restored the previous app: fingerprint equals `backup.sha` (files `9d1f5f22...412c`, links `30001a54...f88af`). The candidate app was moved aside by the script; the temporary profile and library were not deleted. Final audio state, verified read-only at 21:47 PT: output MacBook Air Speakers, input MacBook Air Microphone, volume 25, unmuted. The owner's AirPods Automatic Ear Detection setting is theirs to confirm.
