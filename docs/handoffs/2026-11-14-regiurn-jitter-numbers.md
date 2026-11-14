# Regiurn 8-hour run: boundary-difference numbers (2026-11-14)

Numbers only, no opinions and no thresholds. Source: a copy of the Regiurn 8-hour evidence (`rescore-copy-8h`, chunk logs only); the original folder was not read or changed. No audio was opened. The BCHEN-W10 8-hour run is not used.

"Boundary difference" = start of a chunk minus end of the previous chunk, in ms (negative = overlap). Only differences with magnitude under 2 ms are in the distribution; differences of 2 ms or more are counted separately.

| | Microphone | Meeting |
| --- | --- | --- |
| Chunks | 5765 | 5761 |
| Boundary differences under 2 ms (count) | 5764 | 5759 |
| Differences of 2 ms or more (count) | 0 | 1 (the marked 8 ms gap) |
| Mean (ms) | 0.0008 | 0.0000 |
| Standard deviation (ms) | 0.1876 | 0.0000 |
| 99th percentile of absolute value (ms) | 0.6859 | 0.0000 |
| 99.9th percentile of absolute value (ms) | 0.7050 | 0.0000 |
| Worst clock-hour net (ms) | 0.594 | 0.000 |
| Whole-run net (ms) | 4.376 | 0.000 |
| Chunks with exactly the expected frame count | 5756 of 5765 | 5759 of 5761 |
| Chunks whose frame count matches their stamped span (within 1 frame) | 5765 of 5765 | 5761 of 5761 |

Expected frame count = the most common count among rollover-closed chunks: 240,000 frames (5 s at 48 kHz) on both tracks. The chunks without it are those closed early (microphone 9, all closed by a discontinuity; meeting 2, one by a discontinuity and the final one by the stop); each holds the frame count its own span implies.

Method: `node` script over `logs\microphone.chunks.log` and `logs\meeting.chunks.log` of the copy; percentiles are nearest-rank on the sorted absolute values.
