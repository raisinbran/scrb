# Gate 3 retest: word-timing method decision (Claude Code, 2026-11-08)

Scope: timing method only. Analysis of preserved files only; no synthesis, recording, playback or build. Branch `rosmont/windows-gate3-retest-preflight-20261108` at `a07f091` (PR 74). Evidence: `gate3-v3-preflight-20261108\renders-probe-selected-20261108\probe`. Measurement: 5 ms RMS frames, threshold max(128, 3% of file-peak RMS), read-only Python (script kept outside Git). Status: **recommendation for independent review; not owner-approved.** Revision 2026-11-09: the 25 ms spread limit below was replaced for offsets by the owner-approved 100 ms policy (onset stays 25 ms); see the README and the proposed amendment for the rule text.

## 1. Engine marks: drop them

The marks are not salvageable. The preserved files falsify every mapping from AudioPosition to the WAV timeline, so no scale factor can be correct, whether guessed or fitted.

| Observation (preserved files) | Zira (meeting) | David (microphone) |
|---|---|---|
| Encoding C, words 00–14: `e` mark | **0.164 s in all 15 files**, although energy offsets range 0.565–1.080 s | 0.757–1.297 s; e/offset ratio 1.54–1.97, not constant |
| Encoding C, word 15 (last in the run): `e` mark | 2.444 s in a **1.629 s** file | 2.204 s in a **1.690 s** file |
| Encoding A: `s(n+1)` vs `e(n)` across the 30 ms SSML break | identical in every pair; the break adds no AudioPosition time | identical in every pair |
| Last mark / WAV duration (A, B) | 1.500 (25.327/16.884, 14.107/9.405) | 1.470, 1.461 |

- A mark that is the same for words of different length cannot be mapped to word ends by any monotone function. The Zira "exact 1.5" holds only for the **last** mark, which falls past the end of the audio. It is an end-of-stream artifact, not a timebase.
- The breaks do not advance position, and the final mark falls past the end of the file. Both are consistent with marks being reported when the engine reaches them in its text or stream processing, not at output sample positions. This is a description, not a tested cause: no run here can separate the two, and none is worth buying. Under the stated rule (a stated, tested cause or drop), the marks are **dropped**.
- Codex's encoding C would have **cropped on these marks**. On Zira that keeps 0–164 ms of each word, which removes most of the speech. It was never assembled, so nothing was affected. The probe also reported counts that were complete under the message "Incomplete engine bookmarks…". Both are proposed below as A-023.
- Measured synthesizer padding in the per-word WAVs. Lead silence: Zira 105–150 ms, David 120–220 ms. Trail silence: Zira 829–855 ms, David 1070–1204 ms. If whole files were joined, every join would hold about 1 s or more of silence, breaking the gap rule under 0.5 s. The padding must be measured and cropped per file, never assumed.

## 2. Recommended method: constructed units with measured edges

Each utterance is built from separately synthesized units:

- **Final-word unit:** the utterance's last word, synthesized alone.
- **Prefix units:** words 1…n−1, synthesized as phrases of 3–5 words. An utterance of one word is its final-word unit only.

Each unit WAV is measured for energy onset and offset, then cropped to [onset − 20 ms, offset + 30 ms]. Units are joined with digital zero silence inserted by sample count: a fixed join `J` inside an utterance, and placement-computed gaps between utterances.

Timing in the joined track, all values exact sample indices:

- utterance start = placement + (onset − crop start)
- last-word start = the final-word unit's placement + (onset − crop start)
- **acoustic end** = the final-word unit's placement + (offset − crop start)
- **`crop_end_bound`** = the first sample of the digital silence after that unit (the crop end). The acoustic end lies at or before it; the two differ by at most 30 ms plus frame and threshold uncertainty.

Prefix-internal word boundaries are not claimed. The protocol needs only each utterance's start, its last-word start and its last-word end.

Check against protocol v3:

| Requirement | How the method meets it |
|---|---|
| Neutral voices, two distinct (one per track) | Unchanged: Zira for meeting, David for microphone, same `-15%` prosody |
| About 150 wpm | Phrase units keep connected speech. New check: words-per-minute of the constructed speech span in [130, 170] |
| Failure window 170–245 s, gaps under 0.5 s | Placement controls every inserted gap. Checked by a same-method silence-run scan of the **joined** file (section 4) |
| No overlap within a track | Sample-index intervals are disjoint by construction and asserted |
| Disjoint vocabularies | Unchanged; the existing assertion runs on unit text |
| Separate crop-end and acoustic-end bounds (`crop_end_bound`, `acoustic_end`) | Both recorded per utterance, as defined above |
| Short/long mix, at least 8 shorts in the window, simultaneous speech for at least 180 s | Existing assertions, run on the constructed intervals |

Checks on the constructed timing, all deterministic and offline. Items 1, 2 and 5 are arithmetic or same-method consistency checks, not independent acoustic ground truth. Item 3 is **not implemented**: `verify-joined.py` runs no fresh joined-file energy analysis and so does not confirm onsets or acoustic ends within ±5 ms. Item 4 is a second energy threshold on the same unit, not independent evidence:

1. Every inserted silence span in the joined WAV is exactly zero samples.
2. The SHA-256 of each unit segment in the joined file equals the hash of its cropped slice of the source unit WAV (no off-by-one, no resampling). This is an arithmetic consistency check.
3. A fresh energy analysis of the **joined** file finds every constructed onset and acoustic end within ±5 ms. (Not implemented; planned only. A consistency check against the same method, not ground truth.)
4. A second threshold (absolute −45 dBFS, PCM16 amplitude 184) moves no edge by more than 25 ms. The spread is recorded as boundary uncertainty.
5. No silence run of 0.5 s or more inside 170–245 s, measured on the joined file.

The waveform spot-check and listen-through required by the protocol remain mandatory before freeze.

## 3. Risks the method adds

- **Prosody resets at joins.** A prefix ends without its natural link into the last word, and the final-word unit carries isolated-word lengthening. Utterance-final lengthening is natural anyway, so the larger risk is a slight pitch reset at the join.
- **VAD segmentation.** If `J` is at or above the candidate VAD's minimum-silence setting, the VAD may split utterances that natural speech would keep together. That would alter exactly the stage being localized. Mitigation: Codex reads that setting from candidate `553dd90` source (read-only) and the assembler requires `J` below it with margin (default `J` = 40 ms, 960 samples).
- **Recognizer behavior on isolated words.** The final word arrives with no coarticulation. Recognition could be slower or wrong at precisely the word whose timing is scored. Phrase prefixes limit this to one word per utterance. The listen-through flags units that are unclear.
- **Threat to purpose.** The retest asks where live system-track words were delayed: VAD, handoff, recognition, delivery or UI. Delivery and UI stages do not depend on the audio's naturalness, so the method does not threaten their localization. VAD and recognition stages may behave differently from natural speech. A clean result (no anomaly) therefore cannot fully rule out a natural-speech trigger, and an anomaly localized to VAD or recognition must carry this caveat in the report. The risk is bounded and stated, not fatal. A method without trustworthy reference timing would leave every localization INCONCLUSIVE, which is worse.

## 4. Source changes for Codex

All on the PR 74 branch, under `scripts/gate3-retest/`; no `packages/contracts`, no production code. Checks are synthetic and must run without audio.

1. **`speech-specs.ps1`**: express each utterance as ordered units: prefix phrases of 3–5 words plus one final-word unit. Keep texts, voices, rate and disjoint vocabularies. Add a unit id `track-utt##-u#` and a role (`prefix` or `final`).
2. **`SpeechRenderer.cs`**: add a mark-free render path. Plain SSML (voice plus prosody, **no `<mark>`**) to a 24 kHz mono 16-bit WAV per unit, a single `SpeakSsml` call per unit, no retry. Return the sample count and SHA-256 per file. The A/B/C paths stay, as probe-only diagnostics that never feed timing.
3. **`prepare-speech.ps1`**: add `-Method ConstructedUnits`, the only path that renders full sources. Fail if the output directory exists or is not empty. Write `units-manifest.json` (unit id, text, voice, file, samples, SHA-256, renderer version). Stop on the first failure, keeping all files.
4. **`measure-units.py`** (new): per unit, 5 ms RMS onset and offset at the primary threshold max(128, 3% unit peak) and at the secondary −45 dBFS threshold. Record lead, trail and spread. Fail on no active frame, a spread over 25 ms, or an onset/offset inside the first or last frame (clipped synthesis).
5. **`assemble-sources.py`**: drop the engine-mark input. Consume `units-manifest.json` plus the measurements. Crop and join by sample counts, with `J` from the command line (default 960). Fail if `J` ≥ (the candidate VAD minimum-silence setting in samples − 480). Emit per-utterance `start`, `last_word_start`, `acoustic_end`, `crop_end_bound`, `uncertainty_s` and `timing_basis: "constructed-sample-offset+unit-energy"`. Run all existing placement assertions on these intervals plus the new 130–170 wpm check.
6. **`verify-joined.py`** (new): checks 1–5 of section 2 on the joined WAVs. Writes `joined-verification.json` and exits non-zero on any failure. The assembler must refuse to emit annotations without a passing verification.
7. **Tests** (`test_sources.py`, plus a new `test_units.py`): in-memory synthetic bursts with known lead/trail silence. Cover:
   - measurement accuracy within ±5 ms
   - crop arithmetic
   - exact join counts
   - a one-sample join mutation, which must make the verifier fail
   - a non-zero sample in a silence span
   - a gap of 0.5 s or more in the window
   - overlap
   - a threshold spread over 25 ms
   - `J` at or above the VAD limit
   - the wpm bounds

   `test_bookmarks.py` stays, marked diagnostic-only.
8. **Candidate VAD constant**: record the file, line and value of the minimum-silence/hangover setting at `553dd90` in the README (read-only).
9. **`README.md`**: record the method change and the evidence table in section 1. A-019 closes as "engine marks unusable as a WAV timebase; cause not established; dropped." Propose **A-023**: encoding C's mark-based crop would have truncated Zira words to 164 ms (caught before assembly), and the probe reported complete counts under an "Incomplete engine bookmarks" message. A-013–A-022 unchanged.

Codex runs: the unit tests, then `measure-units.py`, `assemble-sources.py` and `verify-joined.py` on the owner's output. These are file processing only: no playback, no synthesis in the sandbox. Claude Code reviews the diff and reruns the tests before the owner run.

## 5. Protocol amendment text (for ChatGPT's independent review; not applied)

Replace section 2, line 36, second and third sentences:

> Word timings come from construction, not from TTS engine word-boundary marks, which were shown not to follow the WAV timeline on this host. Each utterance is synthesized as separate units: prefix phrases of 3–5 words and the final word alone. The synthesizer's lead and trail silence in each unit is measured by waveform energy and cropped. Units are joined with digital silence inserted by sample count. The utterance start, last-word start, acoustic end (last-word energy offset) and `crop_end_bound` (start of the following inserted silence) are exact sample offsets in the joined file. They are checked by a second-threshold spread of 25 ms or less, exact-zero silence spans and per-segment hashes (arithmetic and consistency checks, not independent acoustic ground truth; a fresh joined-file energy analysis within ±5 ms is not implemented). They do not depend on the app's own speech model. Within-utterance joins are shorter than the candidate VAD's minimum silence.

Append to section 2, line 77:

> Constructed units may alter prosody and recognizer behavior relative to natural speech. Any comparative anomaly localized to VAD or recognition is reported with this caveat.

Section 8, item 3: after "word timings", insert "(timing basis, unit manifest and joined-file verification, each with SHA-256)".

## 6. Owner-run step

One run, after Codex's changes pass the unit tests and Claude review, and after the protocol amendment is reviewed. Expected under 10 minutes; nothing else should use speech or audio meanwhile. In normal Windows PowerShell 5.1, **not** Administrator:

```powershell
powershell.exe -NoProfile -File "C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest\prepare-speech.ps1" -Method ConstructedUnits -OutputDirectory "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109"
```

It renders unit WAVs only: no playback, no recording.

## 7. Stop rule

Stop, preserve every file, record the incident and return to planning (no rerun, no parameter change, no fallback to engine marks or to a scale factor) if any of these happens:

- the render fails
- any unit fails measurement
- `verify-joined.py` fails any check
- any placement assertion fails
- the listen-through flags more than 10% of units on a track as choppy or unclear

## Usage row (proposed for `agents/agent_task_allocation.md`; not entered)

| Agent/model | Surface | Task | 5-hour remaining start → end | Weekly remaining start → end | Resets | Overlap | Outcome |
|---|---|---|---|---|---|---|---|
| Claude Code, Opus 5.5 (`claude-opus-5-5`), low effort | Claude desktop (Windows), Code tab | Gate 3 word-timing decision | 87% → 86% | 95% → 95% | 5-hour 2026-11-09 04:50 UTC; weekly 2026-11-13 13:00 UTC | unknown | Recommendation delivered; review pending |
