# Handoff: UNIDENTIFIED classification, D4 check, D6 fix (paused by the owner, 2026-11-09 PT)

Branch `rosmont/windows-gate3-integration-2-20261109`. Offline only; nothing scored or recorded.

## Done
- `scripts/gate3-retest/classify-unidentified.py`: classifies each UNIDENTIFIED unit (classes a/b/c/d) from raw samples. Output outside Git: `observer-validation-3/classification-20261109/`. Validation-3: microphone 16 = a9 b4 c1 d2; meeting 21 = a13 b3 c4 d1. With scripted scroll windows plus 20 s recovery, 15 of 16 microphone and 18 of 21 meeting units are in scroll-affected time; the other four are recognition errors (microphone-029, meeting-031 to 033). Outside scroll windows 64 of 68 units were identified (94%). No retained run is free of scripted scrolls (validations 3, 4, 5 all scrolled; validation-2 had no playback).
- D4: the dry run used `long_correlation.match_long_correlation` (bounded correlation), which the v3a amendment does not approve and the code's own docstring says has no approved calibration. Exact PCM (`match_long`) found 0 of 12 units per track on validation-3 (source 24 kHz, recording 48 kHz, Opus route).
- D6: `v3a_timing.attach_source_spread` and `source_spread` carry the frozen annotation's earliest/latest end and onset spreads into the scored intervals (both bounds, fail closed for source-timed units). New `test_source_spread.py` and an end-to-end test; both fail on a2e8658.
- Checks: Python 266 tests, 0 fail, 0 skip (with `SCRB_V3A_PRACTICE_ROOT` and `SCRB_MATCHER_DIR` set); `npm run check` exit 0; PowerShell parse 0 errors.

## Not done
- D2 waveform-energy spot-check of 12 clips and the tolerance proposal (existing material: `renders-units-20261109-r3-derived-1/spotcheck/`).
- Shorts-in-failure-window check: units overlapping 170-245 s are 8 shorts per track (strictly-inside count not yet checked).
- Independent review of the matcher change, `make-draft-annotations.py`, `classify-unidentified.py` (no repo test) and the D6 change.

## Continue
1. Run the D2 spot-check (fixed rule, e.g. every 11th unit), report TTS end vs energy end, propose but do not freeze a tolerance.
2. Check shorts strictly inside 170-245 s per track.
3. Add a test for `classify-unidentified.py`.
4. Request independent review.
