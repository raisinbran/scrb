# Gate 3 Windows: freeze-surface list for the real run (DRAFT, not frozen)

Status: **DRAFT.** A list of what the real run uses and must check before it starts. It adds no process and approves nothing.

## Observer tool

- `scripts/gate3-retest/observe-live-v3.ps1` (Windows PowerShell 5.1, not Administrator). Required: `-AppProcessId`, `-OutputFile` (must not exist), `-Seconds`. Recommended options: `-WordBounds -SkipWhitespaceElements`. Validation-5 ran with them live, and the whitespace skip was verified offline to leave publications unchanged (runs 3 and 4). `-ViewportName` defaults to `Live transcript`; `-PollMilliseconds` defaults to 0.

## Analysis scripts (hash at freeze)

- `observer_publications.py` (raw file to publication file and report; `--phase-mark` for recording and scrolling phases), `observer_session_map.py` (conversion to session time, header hash), `analyze-bounds.py` (scorer, endpoint binding, regeneration check), `v3a_timing.py`, `occurrence_matcher.py`, `marker_clock.py`, `long_correlation.py`, `detect-v3a-steps.py`.

## Pre-run checklist

1. Fresh app profile, so no old rows are on screen. A first sample with visible words makes the run INCONCLUSIVE.
2. The first video frame must show the expected overlay time (`clock-overlay.ps1`). Validation-3's video missed about 60 s at the start, cause unknown.
3. Frame capture and the resource sampler run as backup.
4. Default playback device `Speakers (2- Realtek(R) Audio)`, volume 10 as in the practice run (`play-sources.ps1` refuses anything not Realtek).
5. Explicit `CABLE Output` chosen as the microphone in the app.
6. Native candidate pinned and `launch-candidate.ps1` check-only hashes match.
