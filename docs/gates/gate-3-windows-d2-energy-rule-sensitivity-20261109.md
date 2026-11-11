# D2 acoustic-end energy-rule sensitivity, all 140 utterances (2026-11-09)

Status: **sensitivity evidence only.** Not independent acoustic truth, no pass/fail tolerance, no margin added, no bound or threshold changed. The approved 5 ms two-threshold acoustic-end rule is unchanged. Whether any alternative rule belongs in the scoring interval is the owner's decision.

Tool: `scripts/gate3-retest/energy-end-sensitivity.py` (offline, joined r3 source WAVs, 24 kHz). Raw per-utterance rows are outside Git: `gate3-v3-preflight-20261108/energy-end-sensitivity-20261109.json` (SHA-256 `78f1d1025a33f77d88ff8936c1ad0f3069a46fda21a3a736165e1b10d9cb09dd`). Every rule is an energy threshold on the same audio that produced the annotation, so agreement or disagreement between rules shows how much the end depends on the threshold, not where the speech truly ends.

Rules compared with the annotated `acoustic_end`: B = 10 ms frames, end at 10% of the peak frame (-20 dB); C = 20 ms frames, 1% of peak (-40 dB). The 12-clip spot check used the same two rules on every 11th utterance.

Disagreement with the annotated end, absolute seconds (signed median negative = alternative ends earlier):

| Rule | Group | n | median | p95 | max | signed median |
|---|---|---|---|---|---|---|
| B 10 ms/10% | all | 140 | 0.025 | 0.075 | 0.125 | -0.025 |
| B | microphone | 65 | 0.020 | 0.095 | 0.125 | -0.020 |
| B | meeting | 75 | 0.025 | 0.075 | 0.100 | -0.025 |
| B | long | 84 | 0.020 | 0.030 | 0.030 | -0.020 |
| B | short | 56 | 0.0375 | 0.100 | 0.125 | -0.0375 |
| C 20 ms/1% | all | 140 | 0.010 | 0.075 | 0.075 | +0.010 |
| C | microphone | 65 | 0.015 | 0.075 | 0.075 | +0.015 |
| C | meeting | 75 | 0.005 | 0.015 | 0.015 | +0.005 |
| C | long | 84 | 0.005 | 0.075 | 0.075 | +0.005 |
| C | short | 56 | 0.0125 | 0.020 | 0.030 | +0.0125 |

Relation to each unit's own annotated earliest/latest end spread: rule B ends outside the spread for 140 of 140 utterances (largest miss 0.120 s); rule C for 46 of 140 (largest miss 0.010 s; microphone 26 of 65, meeting 20 of 75). This is a descriptive count, not a test.

Reading: the end of a word moves by tens of milliseconds with the energy threshold, most for short words under rule B (a decaying tail sits under the 10% level); for long utterances rule B differs by at most 0.030 s, rule C by up to 0.075 s. The 12-clip results (B passing 0 of 12, C 5 of 12 against the spread) came from a rule that was never an approved pass test, and are retained only as the earlier look at this same quantity.
