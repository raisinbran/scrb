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

**Device switches, 2026-10-30, hands-on with AirPods:** recording continued through connecting them, setting Input to the MacBook mic, and returning them to the case. The first run found a chunk at the wrong rate after a switch, because the writer read the rate from the ring and slots from the old device outlived the switch: 5 s of audio was stored as 10 s at half speed. Each slot now carries its rate, and a change closes the chunk. The rerun had no wrong durations, with 4 mic switches, 186 ms lost in total, all shown as gaps, and no loss on the meeting track.

`device_case.py` runs this with the floating window from `Countdown.swift`. `pause_case.py` now skips slivers at the end of a chunk, which gave false marker readings. After both fixes it passes 8 of 8, and `stop_paused_case.py` passes 10 of 10.
