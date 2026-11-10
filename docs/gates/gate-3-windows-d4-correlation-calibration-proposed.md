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
Of the 12 scenarios, 11 had at least one unvalidated anchor (step inside the template). Under the current rule one unvalidated anchor makes the track INCONCLUSIVE.

## 2. Real practice recording (independent of correlation)
Marker tones detected in the continuous views and in the source; the two correlation anchors nearest each marker compared with the marker-derived offset (marker detection step 5 ms, so +/-10 ms with the source detection):
- microphone: marker offsets 3.695 s (lead), 3.775 s (trail); anchors 21 s and 32 s after the lead and 8 s and 16 s before the trail differ by 0.0 ms.
- meeting: marker offsets 3.655 and 3.645 s; the anchors differ by 6 ms at all four positions (inside the marker's +/-10 ms).
Agreement is to the marker's resolution; it cannot show errors below about 5-10 ms.

## 3. Proposal (not approved)
1. For a validated anchor whose template contains no step, the evidence supports the existing reported uncertainty (13-17 ms) as covering the **method** error with margin: observed maximum 2.4 ms in 478 simulated and 4 real-marker comparisons. No change to the formula is proposed.
2. A step or gap **inside** a 3 s template can leave a validated anchor wrong by up to the step (54 ms at measured noise, 163 ms at higher noise). This is **not bounded** by the reported uncertainty. The evidence does not support a bound for such anchors, so a track in which any anchor is unvalidated, or in which a planted-like step sits inside a template, stays **INCONCLUSIVE** (the current rule). Do not relax it.
3. Not covered by any of this: route-dependent bias (VB-CABLE, loopback enhancements, device processing), room acoustics, real encoder build differences, non-white noise, and real dropouts of other shapes. These cannot be simulated here; the real-data check only shows the practice route agreed with the markers to 0-6 ms.
4. Exact-PCM matching remains unusable (0 of 12). No other matching method is proposed.
