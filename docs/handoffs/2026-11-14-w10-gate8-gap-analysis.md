# BCHEN-W10 Gate 8 run: marked-gap analysis (2026-11-14)

Read-only analysis of the completed 8-hour recorder-only run (started 2026-11-14 01:39:58 PST, planned duration reached, `RESULT: FAIL` on both gap checks). Source: `logs/events.jsonl`, `logs/microphone.chunks.log`, `logs/meeting.chunks.log` in the evidence folder `20261114-014000`, and the Windows System and Application event logs for 01:39 to 09:45 PST. Numbers and event fields only; no audio was opened. Times are PST. Not independently reviewed.

## Counts

| | Microphone | Meeting |
| --- | --- | --- |
| Verifier marked gaps | 144 | 27 |
| Discontinuities with `missingMs` of 2 ms or more (events and chunk logs agree) | 165 | 26 |
| Total missing audio in those | 3,281 ms | 1,140 ms |
| Over 50 ms | 20 | 6 |
| Over 150 ms | 14 | 3 |
| Cause field | `unknown` on all 165 | `unknown` on all 26 |

The verifier counts (144 and 27) differ from the raw counts (165 and 26); I did not work out why, and no numbers here rest on that difference. Also: no all-zero chunk, no padded span, no chunk gap or `.part` file; 168 `flag` events with 0 ms missing were not counted.

## Pattern

1. **Every gap over 50 ms on the microphone (20 of 20) happens at one wall-clock moment: about 18 s past a minute ending in 1 or 6** (02:11:18, 02:21:18, 02:36:18, 02:51:18, 03:16:18, 05:36:18, 05:46:18, 06:26:18, 06:31:18, 06:51:18, 07:26:18, 07:36:18, 07:41:18, 07:46:18, 08:01:18, 08:11:18, 08:26:18, 08:31:18, 08:51:18, 09:11:18). That is a 5-minute cycle with a fixed phase of 1 min 18 s.
2. **The meeting track shows the same slot:** 25 of its 26 gaps are at that same time of the cycle (one other, 190.356 ms, at 01:40:29, 25 s into the run), and 25 of 26 fall in the same second as a microphone gap. So the two tracks stall together, which points at the helper process or the machine, not at one audio device.
3. **Only part of the cycles are hit:** 22 of about 95 slots on the microphone. Hits are spread over all hours (microphone 5, 19, 18, 23, 13, 26, 25, 21, 15 gaps per hour from 01:00 to 09:00), with no time of day that is worse.
4. **A second, small pattern on the microphone only:** about 84 gaps of 2 to 3 ms (about 233 ms in total) in the last 30 s of each 5-minute cycle (270 to 299 s). They are the sub-tolerance gaps behind the verifier's "444.9 ms in gaps under 2 ms" line. Not seen on the meeting track.
5. **Biggest gaps:** microphone 192.645 ms at 02:21:18, then 176.7 ms at 02:36:18, 174.5 ms at 02:11:18, 173.7 ms at 08:31:18; meeting 210 ms at 05:46:18, 190.4 ms at 01:40:29, 180 ms at 08:51:18. Arrival gaps on the larger ones are about 245 to 275 ms against the normal 10 ms spacing, which fits a delivery stall of about a quarter second, not data lost inside the device.

## Windows event logs (read-only)

Between 01:39 and 09:45 the System log has 62 events and the Application log 166. None is a sleep, resume, shutdown, restart, USB reset or disconnect, audio-device change, driver or power event, or Windows Update event (the Kernel-Power, Kernel-PnP, Audio, WindowsUpdateClient and thermal logs hold nothing or could not be read: one query returned "parameter is incorrect"). What is there: file-system shadow-copy and VSS activity with a backup snapshot tool (`SDSSnapshotProcess`) around 02:13 to 02:28 and 08:30 to 08:46, software-licensing (SPP) events every few minutes, group-policy refreshes, Outlook, an error-report entry at 04:45 and 08:09, and a time-service event at 03:14. Their timestamps do not line up with the `:x1:18` / `:x6:18` slots; the nearest, SPP at 03:16:18, is the only exact match (same second as the 03:16:18 gap) and is one event among about 20, so I do not treat it as evidence. No scheduled task with a 5-minute repeat was found.

## What I can and cannot tell

- **Can tell:** the loss comes in 50 to 210 ms stalls, on both tracks at once, at one fixed point of a 5-minute clock cycle, in about a quarter of the cycles, for the whole run. Nothing in the Windows logs explains them. The helper labels every cause `unknown`.
- **Most likely cause:** a periodic every-5-minutes event on this PC (something on a 5-minute timer that briefly stalls the machine or the helper's audio threads). Confidence: **moderate** that it is periodic and host-level (the fixed phase and the simultaneous hits are strong); **low** on what the source is. Nothing in this evidence names it.
- **Cannot tell:** which program or driver; whether the stall is in the helper or in Windows audio; whether the verifier's count difference matters.
- **One measurement that would settle it:** a 30-minute run (inside the 20-minute rule it would need owner approval, or two 15-minute runs) of the same recorder with a process and interrupt trace on (Windows Performance Recorder CPU/DPC and process-start tracing, or Process Monitor with a boot-less short capture) covering the :x1:18 slots; the trace shows which process or DPC is active at each stall. A cheaper first step that needs no recording: list what starts at `:01:18` and `:06:18` every cycle (Task Scheduler history, and process start times in the Security or Sysmon log if enabled). The test must not be rerun automatically.
