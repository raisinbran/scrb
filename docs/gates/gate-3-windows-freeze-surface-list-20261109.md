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
2. Pre-run setup check (before Record): the recorder is started and the overlay window is placed over the area the video will capture. This only sets up the capture; it cannot show that the video contains the overlay, because no frame exists yet. The first overlay-bearing video frame is checked after capture (see Post-capture checks below).
3. Frame capture and the resource sampler running as backup.
4. Default playback device `Speakers (2- Realtek(R) Audio)`, volume 10 as in the practice run (`play-sources.ps1` refuses anything not Realtek).
5. `CABLE Output` chosen explicitly as the microphone in the app.
6. Native candidate pinned and `launch-candidate.ps1` check-only hashes match.
7. Row labels: You maps to the microphone track; Meeting, Speaker ? and Speaker N map to the meeting track. Any other label with words makes the run INCONCLUSIVE. Retained validation-3, -4 and -5 only ever showed You and Meeting; Speaker N has not been seen in real data.

## Run-time binding of the tools (pinned in the manifest section `run_binding`)

- **Orchestrator for the scored run:** `scripts/gate3-retest/run-scored-run.ps1`. The historical `validation-run-tools/run-validation5.ps1` is **not** used: it hard-codes the app PID, the validation-5 evidence folder, a 180 s end and scripted scroll bursts, runs the observer and overlay from `C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest` (another working tree), and plays from the unpinned copy `tools-d2-v2\play-sources.ps1` (byte-identical to the pinned `scripts/gate3-retest/play-sources.ps1`, SHA-256 `5b2da634...`). `run-scored-run.ps1` is derived from it, takes every script from its own checkout (`$PSScriptRoot`), starts the tracked `validation-run-tools/frame-capture.ps1` and `resource-sampler.ps1` instead of embedded copies, has no scripted scroll, and takes the app PID, evidence folder, manifest path and observer lifetime as parameters. It has been parse-checked only; it has not been run (no recording is authorized).
- **Pinned run tools:** `run-scored-run.ps1`, `observe-live-v3.ps1`, `clock-overlay.ps1`, `play-sources.ps1`, `validation-run-tools/frame-capture.ps1`, `validation-run-tools/resource-sampler.ps1`, `launch-candidate.ps1`, `list-audio-endpoints.ps1` and `verify-against-manifest.py`, all with full SHA-256 in the manifest. The verifier also fails if any file under `scripts/gate3-retest` at the pin is not listed in the manifest.
- **Verifier:** `python -I scripts/gate3-retest/verify-against-manifest.py --manifest <approved manifest> --checkout <clean checkout>`. It requires HEAD to equal `pins.doc_pin_commit` and `git status` to be clean (ignored files other than `__pycache__` fail too), hashes every tracked entry from `git show` bytes and compares the working-tree file (line endings aside), hashes every private file (source WAVs, annotations, units, models, tools, native candidate files, evidence) from raw bytes, checks the inventory counts, prints the manifest's own SHA-256, the commit and the UTC times, and exits non-zero on any mismatch or missing entry.
- **When it runs:** from the clean checkout at the pinned commit, before capture and again immediately before scoring; abort on any non-zero exit. `run-scored-run.ps1` runs it before capture and after capture and writes `run-record.txt` (UTC times, manifest SHA-256, orchestrator SHA-256, checkout HEAD, each verifier output file and its SHA-256). The before-scoring run is a manual step and its output must be added to the run record. The manifest file itself is not in the pin; the verifier requires the owner-approved SHA-256 as a parameter (`--approved-manifest-sha256`; orchestrator `-ApprovedManifestSha256`), hashes the manifest after normalizing CRLF to LF (equal to the committed blob bytes, so a Windows checkout cannot change the value), and fails on any difference.
- **Owner runbook:** `docs/gates/gate-3-windows-scored-run-runbook-20261110.md` gives the numbered steps and exact commands for the checkout of the pin, the approved manifest file, the orchestrator command line, the rehearsal variant and the verifier run before scoring. It authorizes nothing.

## Scoring-time procedure: occurrence-matcher binding (D6)
1. Run the pinned `occurrence_matcher` once, directly from the frozen annotation and the converted publication file (`occurrence_matcher.align_occurrences(annotation, converted words, track, clock_basis='recording')`), and write its `OFFLINE_ALIGNMENT_ONLY` output file. Do not hand-edit the unit list the scorer reads.
2. Immediately record, in the run record: SHA-256 of the frozen annotation, of the converted publication file and of the matcher output; the exact command line; and the matcher script's own SHA-256 and the Python version.
3. Before scoring, verify all of those hashes again. The scorer (`analyze-bounds.py`) additionally requires the matcher output's track, clock basis and recording SHA-256 to match and every credited unit to equal its matcher row.
4. **Limit, stated plainly:** this detects any change made after step 2. It is **not protection against coordinated edits made before the evidence is sealed** (for example editing the annotation, the converted file and the matcher output together before hashing), and the scorer does not regenerate the matcher output itself.

## Post-capture checks (manual; none is scripted)

1. First overlay-bearing video frame: after the run, extract frames with the decoder tool until the overlay is readable, and compare that frame's overlay reading with the overlay start tick in `actions.log` (the first-frame check above). A video that starts before the overlay has leading frames without it; look further in. A video that lacks the overlay for a stretch (validation-3) must be reported, not assumed.
2. At least 10 frames with readable overlay, including scrolling, are compared with the observer samples (the validation draft's frame check).

## Run requirements (as agreed; the real run still needs its own written owner authorization)

- Before capture and again before scoring, run `verify-against-manifest.py` from the clean checkout at the final pinned commit; abort on any mismatch; record its output, the manifest SHA-256, the orchestrator SHA-256 and the verification times in the run record (see Run-time binding above).
- Normal PowerShell, not Administrator. Realtek speakers as the default playback device (not Bluetooth), volume 10 as in the practice run, fresh app profile, `CABLE Output` chosen explicitly as the microphone, first-video-frame manual check afterwards.
- No scripted scroll bursts unless the protocol says so.
- Up to 30 minutes in total including setup and cleanup; a run expected to exceed 20 minutes needs the owner's explicit approval before it starts (AGENTS.md). The real run is a separate authorization and is not part of approving the manifest.

## Known limitations (stated plainly)

- Output-start latency is unmeasured.
- Steps below the combined anchor uncertainty are undetectable.
- Route bias (VB-CABLE, loopback) is not simulated.
- A timing-excluded unit that cannot be placed at all stays timing-INCONCLUSIVE without a capture check.
- Classification categories are heuristic.
- Matcher-output binding does not detect coordinated edits made before sealing.
