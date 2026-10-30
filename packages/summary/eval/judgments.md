# Summary judgments (Phase 6 build)

Judge: Claude Code (Opus 5.5), 2026-10-30, by the rules in
`phase0/artifacts/summary/judgments.md`: a reference item scores 1 if any output
action or decision conveys its main content, 0.5 if only partly. The same model
session designed the prompts and judged them, so treat these as one judge's
estimate. Sheets are in `eval/results/<meeting>.judging.md`.

The tuning meetings were read while the prompts were changed. The held-out
meetings were read only after the design was frozen; prompts are generic and
name nothing from any meeting.

## Recall

| Set | Meeting | Items | First pass alone | With coverage pass |
| --- | --- | ---: | ---: | ---: |
| Tuning | ES2016b | 16 | 10.5 | 15 |
| Tuning | ES2008b | 17 | 12 | 14.5 |
| Tuning | TS3012b | 17 | 9.5 | 13.5 |
| Tuning | **Total** | 50 | 32 (64%) | **43 (86%)** |
| Held out | TS3005b | 15 | not judged | 13 |
| Held out | ES2015c | 13 | not judged | 11.5 |
| Held out | IS1004d | 12 | not judged | 6.5 |
| Held out | **Total** | 40 | | **31 (78%)** |
| All | | 90 | | **74 (82%)** |

Scores by reference item (tuning, with coverage):

- ES2016b: UI task on the two concepts 0.5; "look appealing" 0.5 (only "modern"); the rest 1.
- ES2008b: "team members post documentation" 0; objectives instead of age group 0 (output
  gives age ranges: conflict); charging station 0.5 ("battery or charging station"); the rest 1.
- TS3012b: UI concept presentation 0; TV only 0 (output says universal, also in the
  reference); colours without slogan 0.5; TV-mounted finder 0.5 (beep and flash only); covers
  with symbols 0.5; the rest 1.

Held out:

- TS3005b: standby when idle 0; general menu 0; the rest 1.
- ES2015c: personal coaches 0; interface designer 0.5 (a shared item); the rest 1.
- IS1004d: wheel sides 0.5; infrared port 0; size 0; weight and colour 0; single curve 0;
  turbo removed 0 (output keeps it as first presented). This is a final-design meeting that
  revises itself, and its misses are mostly small physical details.

## Precision (held out, read by hand; approximate)

| Measure | Actions (48) | Decisions (115) | Together (163) |
| --- | ---: | ---: | ---: |
| Non-items | ~15 (31%) | ~10 (9%) | ~25 (15%) |
| Remaining repeats of an item already listed | ~4 | ~30 | ~34 (21%) |

Phase 0's single pass had about 6% non-items and few repeats, at lower recall. Non-item
actions are mostly things done during the meeting ("will present the prototype"). Repeats
are rewordings too unlike for the word-level dedupe, for example the same requirement read
out and later agreed.

Known wrong content: ES2015c "regular chip with push buttons and an LCD display" (LCD was
excluded); IS1004d keeps the turbo button. ES2008b repeats the Phase 0 "15 to 35" and
"under 65" target group.

Scores were judged before the last dedupe change (topic words ignored). The final outputs
were then diffed against the judged ones item by item: no scored item went missing, so the
scores stand; the precision table is adjusted for the extra repeats.

## Evidence links (six meetings, 451 items in all lists)

Every kept item links to a line at that exact time (tested). Across six meetings 6 links
were repaired from a quote and flagged, 12 had a real timestamp with thin support and were
flagged, and 6 entries were cut as non-items. No item was dropped for a bad timestamp in
these runs; that path is covered by the model-free tests.

## Runs

Metal, `-ngl 99`, `taskpolicy -c utility`, other jobs running.

| Meeting | Requests | Prompt tokens | Extraction | Both narratives |
| --- | ---: | ---: | ---: | ---: |
| ES2016b | 13 | 47k | 281 s | 60 s |
| ES2008b | 15 | 55k | 280 s | 66 s |
| TS3012b | 23 | 107k | 508 s | 89 s |
| TS3005b | 20 | 93k | 710 s | 62 s |
| ES2015c | 15 | 65k | 539 s | 62 s |
| IS1004d | 15 | 67k | 548 s | 68 s |

No retries or splits in the final runs. The earlier coverage draft hit 3 retries and 1 split
on two meetings, all recovered. Three of 12 narratives ran past the 300 word limit (303–344
words) and carry the warning; none failed.
