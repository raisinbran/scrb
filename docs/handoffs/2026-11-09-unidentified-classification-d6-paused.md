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

## D2 spot-check done (resumed, 19:30-19:40 PT)
- Rule: every 11th unit of the combined 140-unit list (microphone 0-64, then meeting 0-74), starting at index 10 -> 12 clips (microphone-010/021/032/043/054, meeting-000/011/022/033/044/055/066); 4 short, 8 long. Script: `scripts/gate3-retest/spotcheck-energy-ends.py` (offline, joined source WAV).
- Finding: the r3 pack has NO TTS word-boundary marks by design (`constructed_units.reject_engine_timing` forbids them); word ends come from the energy measurement of the rendered unit plus the constructed sample offset. So "TTS mark vs energy end" cannot be compared; I compared the annotated acoustic_end to independent re-measurements in the joined source WAV: same rule (5 ms frames, 3% of peak) differs 0.000 s on all 12 (consistency only); 10 ms frames at 10% of peak ends earlier by 0.020-0.100 s (mean 0.042, max 0.100); 20 ms frames at 1% of peak differs -0.000 to +0.030 s (mean 0.011, max 0.030). Largest differences are on short units (Approved., Save.: 0.095-0.100 s), where a decaying tail sits under the 10% level.
- Proposed (NOT frozen) tolerance: an independent energy rule at a stated threshold should agree with acoustic_end within the unit's own earliest/latest spread (<= 0.100 s offset, matching the amendment limit); CORRECTED 2026-11-09 (A-062): this sentence was wrong. Under the proposed pass rule (energy end inside the unit's own earliest/latest), the 10 ms/10% rule passes 0 of 12 (energy end earlier than the annotated end by up to 100 ms, outside the 10-25 ms spreads by up to 95 ms), the 20 ms/1% rule 5 of 12, and only the measurement's own rule (not independent) 12 of 12. Owner/ChatGPT to decide whether a marks-based check is required at all (D2).
- Shorts strictly inside 170-245 s: microphone 8 (025,027,029,031,034,036,038,040), meeting 8 (030,032,034,037,039,041,044,046). Requirement of at least 8 per track is met, with no margin.
- Still open: test for `classify-unidentified.py`; independent review of matcher change, make-draft-annotations, classify-unidentified, D6 change.
