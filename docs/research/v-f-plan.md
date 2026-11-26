# V-f live remote-speaker replay

Use the [#392 research](https://github.com/raisinbran/scrb/pull/392) and
[paired screening protocol](ami-remote-speaker-threshold-08-screening-20261120.md)
for the candidate and the separation metric. The final-pass baseline is 1.0.
The live Sherpa window baseline is 1.2. The live centroid cosine threshold is
0.50 and the named-speaker promotion floor is 30 seconds. Hold both fixed.

## Fixtures

Use public AMI Mix-Headset PCM as the meeting track and the corresponding AMI
segment annotations as reference. Freeze the following ranges before inference.
Selection uses annotation timing only. Each range has exactly two voices with
at least five annotated seconds, both with at least 15 seconds.

| Role    | Meeting | Start (s) | Duration (s) |
| ------- | ------- | --------: | -----------: |
| Tune    | IS1009a |       240 |           60 |
| Tune    | IS1009a |       360 |           60 |
| Tune    | IS1009b |       300 |           60 |
| Confirm | TS3003b |       180 |           60 |

The confirmation meeting is excluded from threshold selection in this study.
Earlier AMI research reused these series. Treat confirmation as a meeting-level
split for this sweep only. IS1009a contributes two correlated observations.
TS3003b is one confirmation meeting. The study excludes single-voice and busy
multi-voice controls and cannot establish release safety.

## Sweep and score

Replay real Sherpa with the production MeetingDiarizer in five-second chunks.
Use synthetic timed caption slots with empty text to drive attribution across
the window, applying live revisions and merge events. For the experimental
thresholds, use the existing native file-threshold entry point on the same
16 kHz, signed 16-bit PCM window the live worker receives. Require each 1.2 file
result to agree with the native streaming-window result before accepting the
comparison. Run 1.2, 1.0 and 0.8 on the tuning windows. Freeze the selection
before running 1.2 and the selected candidate on TS3003b.

For each of the two sustained references, intersect its union of annotation
intervals with the final provisional caption slot labels. Score 10 ms midpoint samples over 100 ms caption slots. Exclude simultaneous
reference speech from primary scoring. Count a separated pair when both dominant
non-fallback IDs differ and each covers at least 25% of its reference speech
and at least one second. Count distinct IDs, IDs observed with promoted labels in retained slots, and unassigned
reference seconds. Prefer more separated tuning pairs, then fewer excess IDs
above two, then less unassigned speech. Keep 1.2 on ties. Recommend a change
only if it also preserves or improves pair separation on the confirmation
window without adding excess IDs or unassigned time. A replay measures grouping
with controlled timing. Installed capture, ASR word timing, editing, and DER
require separate evidence.

## Runtime and stop rule

The prior Mac integration replay processed 600 audio seconds in 15.05 seconds.
This study processes at most 660 fixture seconds across 11 invocations.
Budget 15 minutes total including input verification, setup, inference, scoring
and cleanup, provisionally two minutes for any single invocation. Verify the
pinned runtime and input provenance and run one baseline preflight before
proceeding. Stop on path or hash mismatch, baseline parity failure, a missing
hop, a runtime error, two minutes per invocation, or a revised estimate above
20 minutes. Route a longer run to Regiurn with owner approval before launch.
Preserve numeric evidence locally and report partial counts if stopped.

Run the driver from the repository root with the verified public fixture asset
root in `SCRB_DEV_ASSETS`, verified development tools in `SCRB_BIN`, and a
fresh private temporary directory in `SCRB_AMI_SCRATCH`. Save stdout once per
fixture and threshold using exclusive creation. The driver accepts a meeting
ID, a start offset in seconds, and a threshold, in that order.

```sh
node --import tsx scripts/research/v-f-live-replay.mts IS1009a 240 1.2
```

Check the WAV and annotation archive against `scripts/dev-assets.sh`, compare
the segment XML bytes with the pinned archive, and verify the two models
against `scripts/model-digests.json`. Inspect the binary dependency closure
and record SHA-256 values for the tools and resolved non-system libraries
before each execution batch.

The driver requires a clean checkout and `SCRB_VF_INPUT_HASHES` pointing to
a JSON map of expected SHA-256 values. Use basenames for the WAV, annotation
files, models and executables, and the keys returned by
`collectResearchRuntimeLibraries` for the staged runtime libraries. Verify
the staged libraries against the full resolved dependency closure before
creating that map. Annotation validation and the two duration floors run
before any native tools. Both outcome and speaker-hop failure receipts
include fixture and runtime identity, decoded PCM SHA-256, and total,
exclusive, and excluded overlap ticks.
