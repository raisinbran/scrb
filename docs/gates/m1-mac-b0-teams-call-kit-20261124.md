# Mac B0 over a real Teams call: owner kit and scoring procedure (2026-11-24)

Status: **kit built, nothing run.** No call made, installed app and library untouched. The generator and cue logic are unit tested (`scripts/b0-teams-kit.test.mjs`); the generator was run once to a scratch folder to check that it renders, that the beep detector finds both beeps in the composed WAV and in its AAC (m4a) copy at 11.8 s and 284.0 s, and that the cue page script renders every phase (Node, stubbed page; not tried in a real browser).

**This is not the frozen B0 setup.** The frozen run plays `say` voices through the Mac speakers and meets the owner-accepted B0 limits. This kit routes the remote voices through a real Teams call and the app's per-app Teams capture. Whether it counts as B0 evidence is the owner's decision (section 6, open items).

## 1. Design and the flaws fixed

- **Remote voices A and B** are the frozen 30-turn script's A and B lines, rendered with the same voices (`say` Samantha for A, Daniel for B) into one audio file with the turn timing built in. The Y slots are silent. The owner speaks only the 10 Y lines live.
- **One file does everything.** `teams-b0-cue.html` has the audio embedded (about 0.7 MB, no network). One tap on START plays the audio and starts the cue from the audio's own clock, so they cannot drift apart. The page shows `YOUR TURN` with the line in large type on a green screen, `GET READY` (amber) for the 3 s before, a red `STAY SILENT` during both beep windows, and the next line and a countdown at all times.
- **Flaw 1, a phone cannot be the cue screen if the audio comes from PC2.** A cue started by hand on another device is seconds off. So the page that plays the audio is the page that cues. Route A below makes PC2 both the audio source and the cue screen.
- **Flaw 2, the mic track only hears the beeps if the Mac speakers play them.** Teams latency does not matter: the meeting track and the speaker output carry the same Teams stream, so the mic hears the beep a few milliseconds after the meeting track does, exactly as in the frozen run. But with headphones or muted speakers the mic never hears a beep, and cell 1 is NOT VERIFIED. So the speakers stay on at a low fixed level, set by the agent in preflight (below), and the cost is that remote speech also bleeds into the mic track at low level. Bleed is measured and reported (section 5), not hidden.
- **Flaw 3, Teams noise suppression can erase a pure tone.** Route A (screen share with computer sound) sends the audio as it is, without the microphone noise suppression. Route B (phone near PC2's mic) goes through that suppression and the beeps will probably be removed, so it is a fallback for cells 2 and 3 only.
- **Pre-roll.** The file starts with 10 s of silence so the call audio settles and the owner can sit ready. Beeps are 0.25 s at 1 kHz, amplitude 0.4 (the frozen run used 0.2 s at 0.2, within the sync tool's 120 to 400 ms detector window). Everything after the lead keeps the frozen spacing: slot k at `lead + 3.5 + 9(k-1)` s, start beep at `lead + 1.8`, end beep at `lead + 274.0`, so the start-to-end spacing is the 272.2 s that `b0-track-sync.mjs` expects. The file is 287.3 s long.

## 2. Make the files (agent, on the Mac, about 1 minute)

```bash
export PATH=~/.local/share/scrb-node/current/bin:$PATH
node scripts/b0-teams-kit.mjs "$B0/teams-kit" --lead 40
```

`$B0` is the run folder made by `scripts/b0-fresh-b0.sh create` (outside the repo, not committed). The script needs macOS (`say`, `afconvert`), plays nothing, stops if the folder exists, stops if any A or B turn lasts over 7.5 s (the script may not be edited), and prints the expected time of each Y line:

| Line | Slot (s after Start) | Line | Slot (s after Start) |
| ---- | -------------------- | ---- | -------------------- |
| Y01  | 13.5                 | Y06  | 157.5                |
| Y02  | 49.5                 | Y07  | 175.5                |
| Y03  | 85.5                 | Y08  | 211.5                |
| Y04  | 94.5                 | Y09  | 247.5                |
| Y05  | 139.5                | Y10  | 274.5                |

The folder gets `teams-b0-cue.html` (copy this one), `teams-b0-remote.m4a` (the same audio, only if a separate player is wanted), `remote.wav` (16 kHz reference, for scoring) and `expected.json` (every turn with id, role, text, slot time and, for A and B, end time, in file seconds). Y03 and Y04 are back to back (slots 9 and 10), as in the frozen script.

## 3. Run order

**Two rooms (amendment after the first Teams run, 2026-11-24).** With both computers in one room, PC2's microphone carried the owner's voice into the call and the Mac played it back into the meeting track (labelled as a remote speaker), and the owner had been told to read the cue from PC2 without being told where to speak. Rules now: the Mac and PC2 are in different rooms; PC2 is unattended while the audio plays; the owner reads the cue from the shared screen in the Mac's Teams window and speaks toward the Mac's microphone; the owner toggles no mute settings. Because START is tapped on PC2, the file is made with `--lead 40`: 40 s of silence before the start beep gives time to walk to the Mac room. Slot times in the section 2 table then add 30 s (the generator prints them).

**Owner (about 20 minutes, about 10 of them active):**

1. PC2 (in another room from the Mac, alone and unattended during the run): start Teams (second account), start a call and invite the first account. Mac: join the call as the first account and **mute yourself in Teams**. Nobody toggles any mute setting after this.
2. PC2: open `teams-b0-cue.html` (made with `--lead 40`, see section 2) in Edge or Chrome and share the whole screen with **Include computer sound** on. Do not tap START yet. Leave PC2's own Teams microphone alone: PC2 is in a different room, so it hears nothing of the Mac room.
3. Tell the agent you are ready. The agent starts the isolated app and the preflight (below). When the agent says so: in Scribe on the Mac press **Start** and choose **Microsoft Teams** as the meeting app. Click Allow on any permission prompt, and click a US state if the location dialog appears.
4. **Preflight (about 3 minutes):** press Start in Scribe (Microsoft Teams), walk to PC2, tap START, and go back to the Mac room within 30 s. On the Mac, read the cue from the shared PC2 screen in the Teams window: it must be legible, and `STAY SILENT` and `YOUR TURN` must be visible (about 1 s of Teams lag is acceptable). Say nothing. Press Stop in Scribe after the beep and a few seconds of voices (about 70 s after START), then reload the page on PC2 (F5).
5. **Main run (6 minutes):** press Start in Scribe (Microsoft Teams), walk to PC2, tap START, and return to the Mac chair within 30 s (the file has a 40 s lead). Read each line when the shared screen shows `YOUR TURN`, **speaking toward the Mac's microphone** (never toward PC2). Stay silent on `STAY SILENT`. At `DONE`, press Stop in Scribe, then end the Teams call.
6. Wait for the app's final pass (about 8 minutes) while the agent scores; nothing else to do. After scoring, the agent may ask for one restart and one Copy transcript click.

**Route B (only if PC2 cannot share computer sound):** open the page on the phone, hold it next to PC2's microphone (PC2 unmuted in the call), tap START there. Expect no beeps in the meeting track: cell 1 will be NOT VERIFIED.

**Agent (before step 3 and after):**

1. `scripts/b0-fresh-b0.sh create`, then section 2.
2. Quit Scribe if it runs. The app gets a new ad-hoc signature per build, so reset its microphone permission: `tccutil reset Microphone com.raisinbran.scribe` (the agent does this; the owner is never asked to toggle settings). Then `scripts/b0-mac-isolated-launch.sh prepare` and `launch` per run sheet section 5, with the isolation assertions. Any mismatch aborts; no fallback to the default library. Install or swap steps are not repeated: the installed candidate's fingerprint is checked and recorded as in run sheet section 5 step 2.
3. Record the routing (run sheet section 4, with one change: speakers on) and `osascript -e 'get volume settings'` before and after. Start with output volume 30%.
4. Preflight check, with `$FFMPEG` as in the run sheet: `node scripts/b0-track-sync.mjs "$FFMPEG" <audio folder> --list` must show the start beep (11.8 s after Start, plus Teams delay) in **both** tracks; remote speech must be present in the meeting track (volumedetect over the A02 slot at 22.5 s to 25 s must exceed the silent gap 14 s to 21 s by at least 15 dB). If the mic track has no beep, raise the volume by 10% and repeat once; after two repeats record cell 1 as NOT VERIFIED and continue. If the meeting track has no speech: stop, environment finding.
5. Main run, then `scripts/b0-mac-isolated-launch.sh evidence <label>` right after Stop, after the final pass and after the restart. Keep `$B0/teams-kit` and the recorded audio.

## 4. Scoring (agent, after the final pass)

1. **Cell 1.** `node scripts/b0-track-sync.mjs "$FFMPEG" <audio folder>`. Verdict rules are run sheet section 7 cell 1 unchanged: PASS needs both offsets within 250 ms and drift within 50 ms; the chunk gap check (no gap over 100 ms in `chunks.json`) is added from the same sheet.
2. **File time to track time.** `d_meeting` = start beep onset in the meeting track minus `startBeepS` from `expected.json` (11.8). This absorbs the Teams delay and the unknown moment of the tap. Predicted meeting-track time of an A or B turn is `slotS + d_meeting` to `endS + d_meeting`. If the meeting track has no start beep, fall back to `d_meeting` = onset of the first A speech (A02, expected at 22.5) minus 22.5, and label every remote window "beep not found, speech-onset alignment (about 0.2 s less precise)".
3. **Y windows.** As the run sheet: speech spans in the mic track (energy above 3x the noise floor, merged within 0.4 s), matched to Y01 to Y10 by order. The nominal times from `expected.json` plus `d_mic` (start beep in the mic track minus 11.8) are a cross-check only.
4. **Cells 2 and 3.** Per run sheet section 7 (one frozen global mapping each, 3x3 table, recognizable = 60% of words in order in the turn's window), using the windows above.
5. **Bleed report.** Mic-track RMS over A and B turn windows against RMS over Y windows, and any live or final text in the "You" voice whose words come from an A or B turn. Under the frozen limits such text is an attribution error and is counted; it is also reported separately as a speaker-bleed finding so the owner can tell it from a diarization failure.
6. **Cell 5 and persistence** exactly as run sheet section 7.

**What Teams' processing changes about the beeps, and what is NOT VERIFIED:**

- Network and playout delay shifts the beep in the meeting track by an unknown, slowly varying amount (typically 0.1 to 0.5 s). The mic hears the same stream from the Mac speakers, so the shift is in both tracks and cancels in `startOffsetMs`, `endOffsetMs` and drift. The beeps measure the gap between the two Mac capture paths, not the call latency.
- Teams' adaptive playout may stretch or squeeze time slightly between the start and end beeps. Both tracks hear the same output, so that cancels too. The tool still checks first-to-last spacing within 2 s of 272.2 s per track; a larger change is NOT VERIFIED.
- Echo cancellation, noise suppression, automatic gain and Opus coding can shorten, attenuate or remove a pure tone. Route A should avoid most of it; the detector needs 120 to 400 ms of 1 kHz at RMS 0.01 or more.
- If either beep is missing in either track (exit 2 of the tool): cell 1 is **NOT VERIFIED**, never PASS or FAIL. That includes a mic track that never heard the speakers.
- Offsets are valid only for the speaker-to-mic path used; headphones make the cell NOT VERIFIED for the same reason.

## 5. Which acceptance cells this can and cannot evidence

| Cell (Mac column)                  | Can it?             | Notes                                                                                                                                                                                                            |
| ---------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Two synchronized tracks          | Yes, if beeps found | Teams per-app meeting track plus built-in mic over the speaker path. Not the whole-computer tap that the frozen run uses.                                                                                        |
| 2 Live text, three voices          | Yes                 | Remote voices arrive coded by Teams; live delay is measured as in the sheet. The "You" live lines also face speaker bleed.                                                                                       |
| 3 Final text, distinct voices      | Yes                 | Same scoring; the owner's real voice, remote voices through Teams.                                                                                                                                               |
| 4 Audible seek                     | **No**              | Needs the headphone earcup against the mic with speakers muted; it conflicts with this kit's speakers-on route and its three clicks are not part of it. Stays with the frozen run (or a separate approved step). |
| 5 Clipboard parity                 | Yes                 | Independent of audio source; needs 30 turns on screen and offscreen coverage shown.                                                                                                                              |
| Persistence                        | Yes                 | Independent of audio source.                                                                                                                                                                                     |
| Windows column, other two machines | **No**              | Mac only.                                                                                                                                                                                                        |
| Teams per-app capture              | Partly              | The frozen run declares per-app capture "not claimed". This run exercises it, which is extra evidence, not a B0 cell.                                                                                            |

## 6. Open items (owner decides; none is assumed)

1. **Does this Teams-routed run count as B0 evidence** for cells 1, 2, 3, 5 and persistence, in place of or in addition to the frozen `say`-through-speakers run? Differences: per-app Teams capture, Teams-coded remote voices, speakers on with bleed, a 10 s pre-roll and 0.25 s beeps at amplitude 0.4 (all disclosed above). The B0 limits themselves are unchanged.
2. **Time authority.** The 60-minute B0 run was approved once. This run is about 20 minutes of the owner's time (the call is about 5 minutes, the final pass about 8); the agent does not start it without a fresh, explicit yes in chat.
3. **Cell 4** (seek) remains for the frozen setup or a separate approved step.
4. **Speaker bleed counting.** Proposed: counted as attribution errors under the frozen limits and also reported separately (section 4 step 5). Say if bleed-caused lines should instead be excluded.
