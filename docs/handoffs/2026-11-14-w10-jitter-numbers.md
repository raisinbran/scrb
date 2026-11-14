# BCHEN-W10 Gate 8 run: chunk boundary numbers (2026-11-14)

Numbers only, from the chunk logs (`logs/microphone.chunks.log`, `logs/meeting.chunks.log`) of the rescore copy `20261114-014000-rescore-copy` of the 8-hour recorder-only run (planned 28800 s, started 2026-11-14 01:40 PST). Read-only; no audio opened. Not independently reviewed.

## Definitions

- **Boundary difference:** for consecutive chunks, `startNs` of the later chunk minus `endNs` of the earlier chunk, in ms. Positive means a gap, negative means an overlap.
- **Under 2 ms:** boundary differences with absolute value below 2 ms. Larger differences are counted but excluded from the statistics below.
- **Percentiles:** of the absolute value, nearest-rank, within the under-2 ms set. Standard deviation is the sample standard deviation.
- **Clock hour:** PST hour of the later chunk's start (run start plus `startNs`). The first and last hours are partial (01:00 starts at 01:40; 09:00 ends at about 09:40).
- **Expected frame count:** 240000 frames (5 s at 48000 Hz), the dominant value in both logs.

## Boundary differences under 2 ms

| | Microphone | Meeting |
| --- | --- | --- |
| Chunks | 6191 | 5774 |
| Boundaries | 6190 | 5773 |
| Under 2 ms (in the statistics) | 5889 | 5747 |
| 2 ms or more (excluded) | 301 | 26 |
| Of the under-2 ms set: positive / zero / negative | 2857 / 173 / 2859 | 0 / 5747 / 0 |
| Mean (ms, signed) | 0.00576 | 0.000 |
| Standard deviation (ms) | 0.3562 | 0.000 |
| 99th percentile of absolute value (ms) | 1.5733 | 0.000 |
| 99.9th percentile of absolute value (ms) | 1.9848 | 0.000 |
| Largest absolute value (ms) | 1.9987 | 0.000 |
| Whole-run net, signed sum (ms) | +33.923 | 0.000 |
| Worst clock-hour net (ms) | +9.334 (06:00 PST hour, 740 boundaries) | 0.000 (every hour) |

Microphone clock-hour nets (ms, boundaries): 01:00 +0.078 (238); 02:00 +4.150 (748); 03:00 +5.198 (722); 04:00 +3.977 (723); 05:00 +2.358 (732); 06:00 +9.334 (740); 07:00 +1.853 (745); 08:00 +2.766 (755); 09:00 +4.208 (486).

## Frame counts, padded spans, missing cause

| | Microphone | Meeting |
| --- | --- | --- |
| Chunks with exactly 240000 frames | 5685 of 6191 (91.83%) | 5748 of 5774 (99.55%) |
| Other frame counts (count) | 480 (299), 256 (19), 49440 (4), others (184) | 480 (5), 1440 (3), 234240 (2), others (16) |
| Chunks with a non-empty `paddedSpans` | 0 | 0 |
| Chunks with a `missingCause` set (all `unknown`) | 165 | 26 |
| Chunks with `overlapMs` above 0 | 170 | 0 |
