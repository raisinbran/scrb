# Gate 3 Windows: freeze-surface list for the real run (DRAFT, not frozen)

Status: **DRAFT.** A list of what the real run uses and must check before it starts. It adds no process, approves nothing, and pins no hash (hashing happens in the freeze step).

## Observer tool

- `scripts/gate3-retest/observe-live-v3.ps1` (Windows PowerShell 5.1, not Administrator). Required: `-AppProcessId`, `-OutputFile` (must not exist), `-Seconds`. Recommended options: `-WordBounds -SkipWhitespaceElements`, as validation-5 ran them live; the whitespace skip was verified offline to leave publications unchanged (runs 3 and 4). `-ViewportName` defaults to `Live transcript`; `-PollMilliseconds` defaults to 0.
- `origin_qpc` can be read from the first line of the raw file while the observer runs only if the reader opens the file with read-write sharing, as `run-validation5.ps1` does.

## Analysis scripts

- `observer_publications.py` (raw file to publication file and report; label rules in `track_for_label`; `--phase-mark`), `observer_session_map.py` (conversion to session time), `analyze-bounds.py` (scorer, endpoint binding, regeneration check), `v3a_timing.py`, `occurrence_matcher.py`, `marker_clock.py`, `long_correlation.py`, `detect-v3a-steps.py`.

## Collection method used in validation-3 and -5 (existing scripts, committed unchanged in `scripts/gate3-retest/validation-run-tools/`)

- **Screen recorder:** the built-in Snipping Tool video recorder (region chosen beforehand). `run-validation5.ps1` presses its New recording and Start buttons through UI Automation (`SnipPress`), and Stop at the end. The script does not set an output folder: Snipping Tool saved the files to `C:\Users\bchen\Videos\Screen Recordings\` (the folder and the 2026-11-09 files exist on this machine), and they were copied by hand into the evidence folder as `screen-recording.mp4`.
- **Transcript and clock together:** the recorded region holds the app's Live transcript pane and the always-on-top `clock-overlay.ps1` window (`-OriginQpc <origin_qpc> -X 20 -Y 800`), started after the observer so it shows seconds on the observer's own clock. Validation-4 had no video and no overlay.
- **Backup frame capture:** `frame-capture.ps1` saves a full-screen JPEG about every 400 ms into `frames\`; each file is named with the Stopwatch tick of the capture. Validation-4 and -5 used the same text; validation-2 and -3 differ only in line endings.
- **Resource sampler:** `resource-sampler.ps1` appends a CSV row every 5 s (UTC time, observer CPU and working set, summed electron CPU and working set). Validation-3, -4 and -5 used the same text (line endings aside); validation-2's differs and is not committed.
- **Orchestrators:** `run-validation3.ps1`, `run-validation4.ps1`, `run-validation5.ps1` drive the run and write `actions.log` (tick, UTC time, action). They are per-run scripts with hard-coded paths and the app PID, and they embed the two backup scripts above. Validation-5 order: Snipping Tool Start, about 6 s later the observer, then the overlay, frame capture and sampler, playback waiter proven ready, app Record, scripted scrolling, Stop plus a 30 s drain.
- **Where output goes:** `observer-validation-N\` under the preflight folder (`raw.jsonl`, `actions.log`, `frames\`, `resources.csv`, `screen-recording.mp4`, playback log).
- **First-frame check (manual; no script exists for it):** extract the first frame of the video with the decoder tool (`gate3-integrated-evidence\decoder\ffmpeg.exe`) and read the overlay. The expected overlay time for a backup JPEG is `(tick in its file name - origin_qpc) / Stopwatch frequency`, so a JPEG's overlay reading can be compared with its own file name. In validation-5 the video starts about 6 s before the observer and overlay, so the first frames show no overlay; the first frame that shows the overlay is the one to check against the overlay start tick in `actions.log`. Validation-3's video missed about 60 s at the start, cause unknown.

## Pre-run checklist

1. Fresh app profile, so no old rows are on screen. A first sample with visible words makes the run INCONCLUSIVE (validation-4 and -5 each had 70 visible words in the first sample).
2. First video frame check as above.
3. Frame capture and the resource sampler running as backup.
4. Default playback device `Speakers (2- Realtek(R) Audio)`, volume 10 as in the practice run (`play-sources.ps1` refuses anything not Realtek).
5. `CABLE Output` chosen explicitly as the microphone in the app.
6. Native candidate pinned and `launch-candidate.ps1` check-only hashes match.
7. Row labels: You maps to the microphone track; Meeting, Speaker ? and Speaker N map to the meeting track. Any other label with words makes the run INCONCLUSIVE. Retained validation-3, -4 and -5 only ever showed You and Meeting; Speaker N has not been seen in real data.
