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
- A step smaller than the combined uncertainty (about 26-34 ms) is not detectable at all. A step up to roughly twice that, with no chunk-timestamp event, can leave an anchor off by about one combined uncertainty and still pass. The figure of about 34 ms against a reported 13-17 ms is an **illustration of a blind spot, not a proven worst-case bound for undetected errors**: an unlogged offset change smaller than the combined anchor uncertainty can evade the pairwise check entirely, while a logged chunk event of 10 ms is caught by the separate 5 ms event rule (an event of 5 ms or more inside the template support plus margin). The planted steps (51-104 ms) are above this region; real ones may not be.
- A step that does not coincide with a chunk boundary: the gap map is then invalid (audited decoded-versus-timestamp counts must reconcile) and the whole track is already INCONCLUSIVE.
- Route bias and the other items in section 3.3.

Retained practice recording, both tracks (offline; real chunk timestamps; chunk-gap events of at least 5 ms: microphone at 141.7 s and 441.6 s, meeting at 141.7 s):
| Track | Long anchors | Validated | Unvalidated | Excluded by the new condition | Timing verdict under the rule |
|---|---|---|---|---|---|
| microphone | 39 | 39 | 0 | 0 | BOUNDED possible |
| meeting | 45 | 45 | 0 | 1 (meeting-024, template 141.6-144.6 s contains the 210 ms gap) | INCONCLUSIVE under the first version; see section 5 |
| both | 84 | 84 | 0 | 1 | |
Unvalidated is 0 here, but in the 12 simulated scenarios (planted steps, measured noise) 11 had at least one unvalidated anchor, so a scored run with steps inside templates can still be INCONCLUSIVE from the uniqueness rule alone. Under the first version one excluded anchor ended a track's timing verdict (superseded by section 5). 

## 5. Per-anchor exclusion and unit-level coverage (owner follow-ups 2026-11-09; **proposed, owner approval pending**)
Source of the whole-track rule: code only. It was inherited from `step_bounds` (commit 069ee04) and carried into the step-free condition. Neither the v3 protocol nor the v3a amendment says it: rules 3, 5, 6 and 7 are unit-level (an unlogged interior step makes "the affected units INCONCLUSIVE"; "Timing that is unbounded or unsupported is INCONCLUSIVE").

Rule in code (`v3a_timing.py`; no bound or threshold changed):
- An anchor that is unvalidated, or whose template is not established step-free, is excluded on its own and never gets the calibrated uncertainty. Its neighbours are re-paired across it.
- **Offset disagreements are remembered.** Unexplained disagreements (offset change over the combined uncertainty, no chunk-timestamp event between the supports) are detected BEFORE exclusion and kept as source-time intervals. A unit whose span overlaps one stays timing-INCONCLUSIVE even when the surviving anchors agree (offsets 0, 0, -80 ms, 0, 0 with no event). Unrelated units and the track are not invalidated.
- **Coverage.** A unit is timing-INCONCLUSIVE when no valid anchor remains on one side, or when a valid anchor that served it within `MAX_ANCHOR_DISTANCE_S` = 30 s no longer does. 30 s is a **proposed coverage limit, not proof that the error stays bounded out to 30 s**. A unit already farther than that from every anchor keeps the earlier handling; exact-PCM anchors keep the earlier step widening.
- **Farther anchor, more uncertainty.** A unit that uses an anchor farther than its original nearest-preceding neighbour adds `DRIFT_RATE_BOUND_S_PER_S` times the extra source distance to the calibrated uncertainty.
- **Capture gaps (rule 6, proposed, owner approval pending).** A unit whose scored last-word interval (earliest placed start to latest placed end, continuous axis, including anchor and step uncertainty) contains a recorded capture gap, overlap or overrun of 5 ms or more is uncredited in both bounds and stays in the denominator (outcome CAPTURE-LIMITED, reported separately as a capture/measurement limitation, not an app-output failure), EXCEPT where the decoded preserved recording verifies the word: the 5 ms frames on both sides of each event before the measured end are above both energy levels of the existing two-threshold acoustic-end rule, and the last active frame under each level ends inside the unit's earliest-to-latest acoustic end interval (`v3a_timing.verify_word_capture`). A verified unit is timing-INCONCLUSIVE (rule 8). Not checkable (no decoded samples for the interval) counts as not verified.
- **Track-level INCONCLUSIVE stays only for** marker disagreement beyond 100 ms, no usable lead/trail marker (marker check, unchanged) and no valid long anchor at all. The earlier count gates (75% share, minimum 4, "more than half unvalidated") are removed; unit coverage handles those cases.
- **Credit rule for TIMING-INCONCLUSIVE units (proposed, owner approval pending).** Stays in the denominator; no credit in the conservative bound; credited in the best-case bound (like SETUP-AFFECTED), so Layer A cannot be a definitive FAIL on them and Layer B cannot read them as late (they give INDETERMINATE). Basis: protocol v3 section 6 defines Layer B as "definitely late (lower-bound latency over 6.0 s), missing or UNIDENTIFIED" and the best-case bound credits only SETUP-AFFECTED; it says nothing about a published unit with unsupported timing. v3a rule 6 says a presence-unsupported unit is "uncredited in both bounds"; that treatment applies here to gap-overlap units the recording does not verify (CAPTURE-LIMITED, above). TIMING-INCONCLUSIVE is used for units with unsupported timing but no gap overlap, and for gap-overlap units whose presence and endpoint the recording verifies.

Proposed, owner approval pending, constants: reach 30 s; drift-rate bound 0.0006 s/s. The drift allowance is an empirical engineering allowance from the practice recording, not a proven bound, and it must not be retuned after seeing scored-run results. Measurement (`practice-timing-report.py`, offline): for every pair of valid long anchors at least 60 s apart in source time with no chunk-timestamp event of 5 ms or more between them, (|offset difference| + both anchor uncertainties) / separation; the per-track maximum is 0.000471 s/s (microphone, 209 pairs) and 0.000548 s/s (meeting, 260 pairs); the bound is the larger rounded up. Anchor uncertainties are added on purpose (a maximum, not a median or fit). Not tuned against anything else; the owner approves both at the v3a sign-off.

Retained practice recording, rerun offline (anchors from the joined audio and real gap maps; units from the frozen annotations; timing support only, not outcomes or latency):
| Track | Long anchors | Valid | Excluded | Units | Timing-INCONCLUSIVE | Still scoreable |
|---|---|---|---|---|---|---|
| microphone | 39 | 39 | 0 | 65 | 1 (microphone-019: gap overlap) | 64 |
| meeting | 45 | 44 | 1 (meeting-024, template across the 210 ms gap) | 75 | 0 | 75 |
Of the 140 units, 139 are scoreable and 1 is timing-INCONCLUSIVE (gap overlap; no excursion intervals, no unit beyond the 30 s reach). 2 meeting units use a farther anchor and carry the extra drift uncertainty. Largest anchor spacing: 8.1 s (microphone), 6.3 s (meeting).

Tests that were edited and the coverage that changed (all re-covered in `test_timing_coverage.py`, scoring path): the shared anchor in `test_v3a_timing.py` moved from 98-100 s to 118-120 s, so the far-anchor (50 s) case is now tested explicitly; `test_v3a_conditional.py` patches out `unexplained_brackets` and `unexplained_intervals` in the step-widening arithmetic test, which no longer proved the unexplained-step policy end to end (now `test_persistent_unexplained_step_restores_the_policy_end_to_end`); two gap-crossing tests in `test_v3a_timing.py` now expect timing-INCONCLUSIVE instead of a credited or PRE-SPEECH result; the "Unvalidated" message test now expects 'No valid long anchor remains'.
