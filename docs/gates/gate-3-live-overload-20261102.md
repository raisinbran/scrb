# Gate 3 live overload fix

Status: code and simulated checks only. Not yet tested on Windows or in a real call.

## Finding

The worker takes one frame at a time for both tracks, and each track ran VAD every 500 ms. On a slow
machine that work did not fit in real time, and one slow hop stopped both tracks while a 2-second queue
overflowed. The Windows Teams run lost at least 2,004 frames per track, about a third of the live audio.
The per-hop VAD load is a reading of the code and a simulation, not a Windows measurement.

## Change

- A frame sent with later frames waiting carries `more`, and VAD then runs every 2 s instead of 500 ms.
  Normal operation with no backlog is unchanged. The flag exists only between supervisor and worker.
- The queue is now 10 s per track (`DEFAULT_QUEUED_FRAMES`), up from 2 s.
- Progress logs gain `inputLostFrames`, `rejectedFrames` and `sentFrames` beside `overflowFrames`, all
  cumulative, so loss before arrival and queue loss can finally be told apart in one window.

No change to capture, recording, contracts or IPC.

## Simulation

The real engine against the supervisor's queue rules on a virtual clock: two busy tracks for 120 s, so
2,400 frames in total. Overflowed frames:

| VAD / model call | 2 s queue, before | 10 s queue only | This change |
| ---------------- | ----------------- | --------------- | ----------- |
| 100 / 300 ms     | 0                 | 0               | 0           |
| 300 / 1000 ms    | 1,424             | 1,179           | 0           |
| 300 / 2000 ms    | 1,557             | 1,385           | 382         |
| 600 / 1500 ms    | 2,019             | 1,823           | 429         |
| 600 / 3000 ms    | 2,075             | 1,885           | 1,018       |

A bigger queue alone barely helps. Above roughly 2 s per model call the machine still cannot keep up on
two busy tracks, and loss remains, marked as gaps. Then the remedy is less model work (a faster live
model, GPU, or not transcribing a mic that only hears the call), which is an owner decision.

## Windows check

Run one five-minute real-app test and read, per track: `inputLostFrames`, `overflowFrames`, `sentFrames`,
`vadCalls`, `modelCalls` and `slowestHopMs`. Pass: overflow near zero, and live meeting words much closer to
the final count than the earlier 541 of 1,021. If `inputLostFrames` is high, the loss is before the queue
and this fix does not reach it. Real model call time from that run says which table row applies.

This branch is based on `fb2d96c` and does not include the `bb542a8` harness safeguards.
