# D4 calibration of the bounded long-correlation anchor, and a MARKED PROPOSAL for the timing uncertainty (2026-11-09)

Status: **PROPOSAL for owner approval. Nothing here is frozen; no threshold or matcher parameter was changed.** Offline only.
Tool: `scripts/gate3-retest/calibrate-long-correlation.py` (tests: `test_calibrate_long_correlation.py`). Raw results are outside Git:
`gate3-v3-preflight-20261108/calibration-long-correlation-20261109/` (measured noise, 6 seeds x 2 tracks), `...-noise40db-20261109/` (sensitivity, 3 seeds x 2 tracks).

## 1. Simulation with planted truth
- Source: the r3 joined source WAVs (24 kHz). Resampled to 48 kHz (ffmpeg `aresample`), scaled to the practice level (microphone -0.4 dB, meeting +2.1 dB), Gaussian noise 0.6 LSB rms (-95 dBFS), the level measured in digitally quiet stretches of both practice tracks.
- Cut into 5 s chunks, each Opus-encoded with the capture helper's settings (`ChunkStore.cpp`: libopus VOIP, 32 kb/s, constrained VBR, complexity 10, 20 ms frames; ffmpeg libopus flags recorded in the result file) and decoded with the scorer's own ffmpeg (hash in the result file). Approximation: ffmpeg's libopus, not the helper's libopus build.
- Known delays: fixed offset 3.695 s (microphone) / 3.655 s (meeting); drift +542 ppm (declared rate 23987 Hz; practice fits were 552 and 526 ppm); 5 steps of 51-104 ms, random sign, plus 3 dropped-audio gaps of 160-210 ms per scenario at random positions in 30-370 s (a gap is a negative step in the sample-continuous view the matcher uses).
- The real `match_long_correlation` ran on every long unit (microphone 39, meeting 45) per scenario with the scorer's search offset (detected lead marker - 1): 504 anchor measurements.

| Result (absolute error, estimated minus planted offset) | n | median | p95 | max |
|---|---|---|---|---|
| validated, no planted step inside the 3 s template | 478 | 1.3 ms | 2.1 ms | **2.4 ms** |
| validated, a planted step inside the template | 3 | 1.9 ms | - | **54 ms** |
| not validated (rejected by the uniqueness rules) | 23 | | | up to 197 ms |

By track (validated): microphone median 1.5 ms, meeting 1.2 ms. By position (60 s bins) the step-free p95 is 2.0-2.2 ms everywhere. The reported `uncertainty_s` is 13.1 ms median, 17.1 ms p95. Error never exceeded it for step-free templates (478 of 478, about 5x margin). At +40 dB noise (3 seeds): step-free max 2.2 ms (239 units), but 5 validated anchors with a step inside their template were wrong by 5 to 163 ms.
Of the 12 scenarios, 11 had at least one unvalidated anchor (step inside the template). Under the first version of the rule one unvalidated anchor made the track INCONCLUSIVE; section 5 (2026-11-09 follow-up) replaces that with per-anchor exclusion.

## 2. Real practice recording (independent of correlation)
Marker tones detected in the continuous views and in the source; the two correlation anchors nearest each marker compared with the marker-derived offset (marker detection step 5 ms, so +/-10 ms with the source detection):
- microphone: marker offsets 3.695 s (lead), 3.775 s (trail); anchors 21 s and 32 s after the lead and 8 s and 16 s before the trail differ by 0.0 ms.
- meeting: marker offsets 3.655 and 3.645 s; the anchors differ by 6 ms at all four positions (inside the marker's +/-10 ms).
Agreement is to the marker's resolution; it cannot show errors below about 5-10 ms.

## 3. Proposal (not approved)
1. For a validated anchor whose template contains no step, the evidence supports the existing reported uncertainty (13-17 ms) as covering the **method** error with margin: observed maximum 2.4 ms in 478 simulated and 4 real-marker comparisons. No change to the formula is proposed.
2. A step or gap **inside** a 3 s template can leave a validated anchor wrong by up to the step (54 ms at measured noise, 163 ms at higher noise). This is **not bounded** by the reported uncertainty. CORRECTION (2026-11-09, review of a35c4bd): an earlier version of this document said such a track "stays INCONCLUSIVE (the current rule)". That was false: `long_correlation.py` only checks that three correlation peaks are unique, and `v3a_timing.py` accepted any such anchor with the calibrated uncertainty. The condition below is now enforced (`v3a_timing.apply_template_step_condition`, called by `analyze_v3a_track`; regressions in `test_template_step_free.py`).
3. Not covered by any of this: route-dependent bias (VB-CABLE, loopback enhancements, device processing), room acoustics, real encoder build differences, non-white noise, and real dropouts of other shapes. These cannot be simulated here; the real-data check only shows the practice route agreed with the markers to 0-6 ms.
4. Exact-PCM matching remains unusable (0 of 12). No other matching method is proposed.

## 4. What is and is not enforced (added 2026-11-09)
Enforced, failing closed (an anchor that fails loses the calibrated uncertainty and is excluded; what that does to units and to the track is section 5):
- A bounded-correlation anchor keeps the calibrated 13-17 ms uncertainty only if its template support, widened by its own uncertainty plus one 20 ms envelope frame on each side, contains no chunk-timestamp gap, overlap or audited overrun of 5 ms or more. (Smaller events add at most 5 ms to the 2.4 ms worst step-free error, below the 13 ms floor.)
- A detected step (offset change over the two anchors' combined uncertainty) must be explained by such a chunk-timestamp event lying between the two supports (margins excluded). An unexplained step makes BOTH adjacent anchors fail, because the step could be inside either template.

Not enforced / not visible:
- The simulation writes no chunk timestamps, so its planted steps are **not visible in a gap map by construction**. The 3 (measured noise) and 5 (+40 dB) validated anchors that had a step inside their template were all caught only by the second rule (offset disagreement with a neighbour, no event to explain it). The same rule also fails 115 of 478 and 64 of 239 clean validated anchors that sit next to a planted step. Whether real dropouts of those shapes appear in the gap map is shown only by the practice recording (below), not by the simulation.
- A step smaller than the combined uncertainty (about 26-34 ms) is not detectable at all. A step up to roughly twice that, with no chunk-timestamp event, can leave an anchor off by about one combined uncertainty (up to about 34 ms against a reported 13-17 ms) and still pass. The planted steps (51-104 ms) are above this region; real ones may not be.
- A step that does not coincide with a chunk boundary: the gap map is then invalid (audited decoded-versus-timestamp counts must reconcile) and the whole track is already INCONCLUSIVE.
- Route bias and the other items in section 3.3.

Retained practice recording, both tracks (offline; real chunk timestamps; chunk-gap events of at least 5 ms: microphone at 141.7 s and 441.6 s, meeting at 141.7 s):
| Track | Long anchors | Validated | Unvalidated | Excluded by the new condition | Timing verdict under the rule |
|---|---|---|---|---|---|
| microphone | 39 | 39 | 0 | 0 | BOUNDED possible |
| meeting | 45 | 45 | 0 | 1 (meeting-024, template 141.6-144.6 s contains the 210 ms gap) | INCONCLUSIVE under the first version; see section 5 |
| both | 84 | 84 | 0 | 1 | |
Unvalidated is 0 here, but in the 12 simulated scenarios (planted steps, measured noise) 11 had at least one unvalidated anchor, so a scored run with steps inside templates can still be INCONCLUSIVE from the uniqueness rule alone. Under the first version one excluded anchor ended a track's timing verdict (superseded by section 5). 

## 5. Per-anchor exclusion (owner follow-up, 2026-11-09; proposed, not approved)
Source of the whole-track rule: code only. It was inherited from `step_bounds` (commit 069ee04: every adjacent pair must be validated or the call raises) and I carried it over in the step-free condition. Neither the v3 protocol nor the v3a amendment says it: rules 3, 5, 6 and 7 are unit-level (an unlogged interior step makes the AFFECTED units INCONCLUSIVE; a finite interval is not proof of capture; steps persist and only bracketing units are widened).

Rule now in code (`v3a_timing.py`; no bound or threshold changed):
- An anchor that is unvalidated, or whose template is not established step-free, is excluded individually and never gets the calibrated uncertainty. Its neighbours are re-paired across it, so a dropout inside one template no longer fails the neighbours that its own step explains (stage 2 of the condition runs on the survivors of stage 1).
- Units are placed from the valid anchors on each side plus the gap map, as before. The step across the excluded anchor is in the bracket's step uncertainty, so every unit's interval still covers it.
- A unit is INCONCLUSIVE for timing (never credited in either bound, kept in the denominator) when it depended on an excluded anchor: with every anchor it had one within `MAX_ANCHOR_DISTANCE_S` = 30 s on each side (anchor end to the unit's last-word end before; anchor start to the unit's onset after), and without the excluded ones it no longer does; or when its span crosses two valid anchors, at least one bounded-correlation, whose offsets differ by more than their combined uncertainty with no timestamp event between them. A unit already farther than 30 s from every anchor keeps the earlier handling (neither stricter nor looser), and exact-PCM anchors keep the earlier step widening.
- Track-level INCONCLUSIVE stays for: a gap-map or marker disagreement (unchanged), no usable lead or trail anchor (a valid anchor within 30 s of the first long anchor's start or the last one's end), more than half of the long anchors unvalidated, and fewer than `max(4, ceil(0.75 x long anchors))` valid long anchors when any anchor was excluded.

Why 30 s: practice anchor spacing is median 5.7 s, maximum 8.1 s (microphone) and median 5.3 s, maximum 6.3 s (meeting). The practice drift is about 0.55 ms/s, so 30 s drifts 16.5 ms, the size of the calibrated 13-17 ms uncertainty; a unit farther than that from any valid anchor would lean on drift alone. The largest gap step uncertainty on the practice recording is about 244 ms (210 ms gap plus the combined anchor uncertainty). The distance, the 75% share and the minimum of 4 are my proposals for owner approval.

Practice recording, rerun offline (anchors from the retained joined audio, the real gap maps; units from the frozen annotations, placement support only, no scored run):
| Track | Long anchors | Valid | Excluded | Units | Timing-scoreable | INCONCLUSIVE for timing | Track gate |
|---|---|---|---|---|---|---|---|
| microphone | 39 | 39 | 0 | 65 | 65 | 0 | pass |
| meeting | 45 | 44 | 1 (meeting-024) | 75 | 75 | 0 | pass |
Neighbours of meeting-024 (valid anchors on both sides, spacing at most 6.3 s) keep every meeting unit within 30 s; units across the dropout are placed with the gap step added to their uncertainty. Not shown by this rerun: outcomes, endpoints and latency (those need a scored run).
