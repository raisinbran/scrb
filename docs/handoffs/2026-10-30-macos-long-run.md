# Mac 4-hour run and the Stop-during-pause fix

**Run:** 2026-10-30, 11:50 to 15:50, real helper, tone plus default mic, 5 pauses of 30 s, helper built before the merge.

| Measure | Microphone | Meeting |
| --- | --- | --- |
| Chunks, numbered without a break | 2850 | 2850 |
| Audio against timeline minus pauses | 14249.941 s of 14249.959 s | 14249.931 s of 14249.940 s |
| Gaps over 1 ms, all reasons | 3, 62 ms in total, longest 23 ms | 2, 43 ms in total, longest 21 ms |
| Chunks crossing a pause | 0 | 0 |

The two tracks' chunk starts stayed between -14.8 and +4.8 ms apart. Streams never stalled. No `.part` was left.

This measures track timelines, not a shared sound on both tracks. Output was muted, so pause test 13's drift figure with a shared sound still needs a run with audible playback.

**Fault found while reviewing the Windows helper:** Stop during a pause moved the gate's cutoff to the moment of Stop, so audio from the pause could pass. On the Mac, `stop_paused_case.py` found one chunk of paused audio in 8 rounds. `rt_gate_close` now moves only an open gate, and 40 rounds on both tracks pass.
