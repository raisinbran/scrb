# V-f live remote-speaker replay

| Meeting | Start (s) | Duration (s) | Threshold | Completed hops | Separated pairs | Output IDs | Observed promoted IDs | Scored seconds (1, 2) | Dominant overlap (s; 1, 2) | Unassigned seconds (1, 2) | Replay elapsed (ms) |
| ------- | --------: | -----------: | --------: | -------------: | --------------: | ---------: | --------------------: | --------------------- | -------------------------- | ------------------------- | ------------------: |
| IS1009a |       240 |           60 |       1.2 |             12 |             1/1 |          3 |                     0 | 23.34, 17.72          | 13.61, 6.79                | 5.94, 3.37                |                1315 |
| IS1009a |       240 |           60 |       1.0 |             12 |             1/1 |          3 |                     0 | 23.34, 17.72          | 13.61, 6.79                | 5.94, 3.37                |                1028 |
| IS1009a |       240 |           60 |       0.8 |             12 |             1/1 |          3 |                     0 | 23.34, 17.72          | 13.61, 6.79                | 5.94, 3.37                |                 964 |
| IS1009a |       360 |           60 |       1.2 |             12 |             1/1 |          2 |                     1 | 30.04, 7.90           | 27.38, 4.72                | 2.66, 1.58                |                1183 |
| IS1009a |       360 |           60 |       1.0 |             12 |             1/1 |          2 |                     1 | 30.04, 7.90           | 27.38, 4.72                | 2.66, 1.58                |                 936 |
| IS1009a |       360 |           60 |       0.8 |             12 |             1/1 |          2 |                     1 | 30.04, 7.90           | 27.38, 4.72                | 2.66, 1.58                |                 932 |

| Coverage and decision                               | Count / threshold | Meeting                   |
| --------------------------------------------------- | ----------------- | ------------------------- |
| Tuning windows completed                            | 2/3               | IS1009a                   |
| Tuning meetings completed                           | 1/2               | IS1009a                   |
| Tuning baseline run failed at 300 s fixture offset  | 1                 | IS1009b                   |
| Confirmation windows completed                      | 0/1               | TS3003b                   |
| Confirmation meetings used to tune this sweep       | 0/1               | TS3003b                   |
| Study meetings previously represented in #392       | 3/3               | IS1009a, IS1009b, TS3003b |
| Independently held-out meetings across both studies | 0/3               | IS1009a, IS1009b, TS3003b |
| Fully promoted two-speaker windows                  | 0/2               | IS1009a                   |
| Recommended live window threshold (retain baseline) | 1.2               |                           |

## Historical evidence receipt

**Per-run provenance: NOT VERIFIED.** The retained [batch input and numeric
report hashes](v-f-historical-hashes.json) identify the preflight inputs and
six successful local output files. The separate preflight manifest did not
bind inputs or runtime identity to each invocation. The original numeric
receipts are retained in the Mac's local V-f evidence directory
(`/private/tmp/scrb-vf-evidence`), under the basenames in the hash summary.
The IS1009b 300 s / 1.2 output file is 0 bytes. The terminal recorded a
speaker-hop failure and exit 1. No completed-hop count or failed-run
provenance was retained. TS3003b appears in the batch input manifest only.

The recorded checkout base was `bc731e263220307c106edf64987c552041339796`
with an uncommitted research driver. The historical driver archived at
`10487ba23a0ba11723eb3c6ad41970168a04f5cb` has SHA-256
`0c2b76269682561e32dc85a9540d20585dd9b33cdd13443cadda620cce295543`.
The Mac was arm64 and the failed invocation reported Node v22.23.4.
Driver settings were 16 kHz mono PCM, 4 Sherpa threads, 5 s hops,
100 ms caption slots, and 10 ms scoring ticks. There is no per-run
PCM digest or OS/runtime receipt for the historical runs.

The table below is a post-hoc, annotation-only eligibility check on the
public fixture files. Counts are 10 ms ticks, in reference index order
starting at 0. It does not recreate any speaker inference evidence.

| Meeting | Start (s) | Total ticks by index | Exclusive ticks by index | Excluded overlap ticks |
| ------- | --------: | -------------------- | ------------------------ | ---------------------: |
| IS1009a |       240 | 2825, 134, 185, 2426 | 2334, 0, 0, 1772         |                    654 |
| IS1009a |       360 | 3712, 48, 102, 1526  | 3004, 0, 0, 790          |                    736 |
| IS1009b |       300 | 1908, 0, 0, 4605     | 1395, 0, 0, 4092         |                    513 |
| TS3003b |       180 | 1510, 0, 0, 3185     | 1447, 0, 0, 3122         |                     63 |

Observed promoted IDs count distinct resolved IDs with a promoted label
in at least one retained caption slot.
