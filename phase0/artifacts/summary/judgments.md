# Summary benchmark judgments (Phase 0)

Judge: Claude Code (Opus 5.5), 2026-10-28, by reading each model output against
the AMI abstractive-summary `actions` and `decisions` sentences in
`fixtures/summary/<meeting>.reference.json`.

Rules:

- A reference item counts as recalled (1) if any output item, action or
  decision, conveys its main content; 0.5 if only partly (for example colour
  without button colour, or "fashion" without "simplicity").
- "Non-items" are output entries that are not follow-up tasks or settled
  decisions, such as role introductions, agenda chatter, procedural remarks,
  backchannels quoted as items, or "meeting will be concluded".
- "Conflicts" contradict the reference.
- AMI references are incomplete, so items absent from the reference are not
  counted as invented.  Verifying every extra item against the transcript was
  out of scope for Phase 0.

## Recall per meeting (reference items: ES2016b 4+12, ES2008b 7+10, TS3012b 7+10)

| Model | ES2016b | ES2008b | TS3012b | Total (of 50) | Recall |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ministral-3-8B-Instruct-2512 Q4_K_M | 14.5 (4 + 10.5) | 14.5 (5.5 + 9) | 13 (6 + 7) | 42 | **84%** |
| Qwen3.5-9B Q4_K_M | 11 (4 + 7) | 10 (2 + 8) | 9.5 (5 + 4.5) | 30.5 | 61% |
| granite-4.2-8b Q4_K_M | 8.5 (2 + 6.5) | 8 (2.5 + 5.5) | 8 (5 + 3) | 24.5 | 49% |

Numbers in brackets: actions + decisions.

## Quality notes

| Model | Items output | Non-items | Conflicts with reference | Valid evidence timestamps |
| --- | ---: | ---: | --- | ---: |
| Ministral | 85 | ~11 (13%): 7 quoted agenda/role lines as ES2016b actions; procedural decisions | ES2008b target group "under sixty-five" (reference: objectives instead of age) | 80/85 (5 ES2016b actions shifted by 30 min) |
| Qwen | 67 | ~3 (4%) | TS3012b says the LCD is both removed and included | 66/67 |
| Granite | 67 | ~12 (18%): role introductions, in-meeting logistics | ES2016b "will not do a two-in-one remote" (reference: will explore it) | 64/67 |

Common misses: decisions stated as design constraints early in a meeting
(corporate colours, slogan placement), and actions phrased as "next meeting,
present X".

## Resources (CPU, 12 threads, 24k context, flash attention, q8_0 KV; CPU shared with other benchmarks)

| Model | Peak private | Peak working set | Time per meeting (13k--32k tokens) |
| --- | ---: | ---: | --- |
| Ministral | 8.8 GiB | 10.0 GiB | 17--44 min |
| Qwen | 4.4 GiB | 8.2 GiB | 10--25 min |
| Granite | 9.5 GiB | 11.3 GiB | 14--49 min |

Prompt processing ran at about 34 tokens/s and generation at about 6 tokens/s
on CPU.  A GPU build is needed for practical summary times.
