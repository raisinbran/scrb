# Gate 3 Windows: orchestrator rehearsal-1 record (2026-11-10 PT)

Status: **evidence record, not scored, not a gate decision.** The rehearsal was a 60 s run of the orchestrator (`run-scored-run.ps1`) against the real app, owner-authorized, to check that the orchestrator, verifier, Snipping Tool steps, overlay and playback readiness work together. Nothing here freezes, approves or authorizes anything. No raw data is in Git.

Private evidence folder (outside Git, kept per `docs/gates/evidence-retention-policy.md` until the owner authorizes cleanup): `C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\rehearsal-1\`. App profile and library: `...\rehearsal-1-app\`.

## Outcome

| Item | Result |
| --- | --- |
| Run | Finished. `run-record.txt` ends `run finished`. Orchestrator log 11:37:46 to 11:39:43 PT, final verifier done 11:39:58 PT (UTC 19:37:46 to 19:39:58). |
| Pins | Code and documents pinned at `76768d5c44e3f267db9892db1d1aa1b1c99e7431`, clean checkout `scrb-run-pin`. |
| Approved manifest SHA-256 used | `daf9e396d0eca0350058c58a0fbef38f05875b10f63e0813cc16e27c2ded623d` (the manifest of that pin; superseded by the manifest regenerated after this record, see the approval sheet). |
| Verifier | **PASS before capture and PASS after capture**, 287 entries and checks, 0 mismatches. Output SHA-256: before `787b2ef8e9cdcf1364506bd4d29cb82aaf6f4b1c384cbd355c919aaa4c896c24`, after `03eb6a56dff4f196c135467cf91205da3a5f3c465f72958c58af1bf34d50d6b0`. |
| Orchestrator SHA-256 | `9d45287bc1ac4a8f54ecd0f9003f284606ade39f23714cc5d1e04c74c4a20ab9` |
| App binding | PID 20140 bound: pinned `electron.exe` (SHA-256 `c579acaab6...087143c`), run profile, one candidate main process. |
| Timings (from `actions.log`) | Record pressed 11:38:10 PT; app Stop control seen **423 ms** after Record; playback first samples about 0.9 s after Record; playback stopped at the 60 s mark; Stop pressed; 30 s drain; Snipping Tool Stop invoked; helpers stopped. No `WARNING:` line. |
| Video | `screen-recording.mp4` (SHA-256 `8b4c4d8c242d4a583c6110423da04700d75bda416bf6692302b5c8929feaf6eb`), 103.03 s, 2522x1246, H.264 plus AAC. |
| Other hashes | `raw.jsonl` `7654116b8dd00e766d0eedd5b7251647834e9cb6a780bd0fb19bcbd025ad1f54`; `actions.log` `5a049ca928b4bac1da9accfa45299f830e1f85bcb3caa6fce4bb502d247be036`; `run-record.txt` `16d396e3b188495b7f669b0f82ef776842b07d2bf94cabe24b43420c5528e60b`. |

## Findings and disposition

1. **Dry-run command lacked `-OutFolder`** (runbook step 9). `play-sources.ps1` throws `-OutFolder is required`. *Disposition:* runbook step 9 fixed. All other runbook commands were checked against their scripts' parameter blocks (verifier, orchestrator, `launch-candidate.ps1`, `list-audio-endpoints.ps1`); no other mismatch.
2. **First-video-frame check (step 18) named a tool that cannot do it.** The pinned decoder `ffmpeg.exe` is audio-only. *Disposition:* the step is now a manual, unscored owner check in a Windows media app (first overlay-bearing frame: video time, overlay reading, advance at about 10 s); the agent compares the reading with the value computed from `actions.log`. The freeze-surface list text was changed to match. See the check below.
3. **Microphone selector showed `System default (CABLE Output...)`** in the rehearsal (owner report), not an explicit device. *Disposition:* runbook step 11 now requires the explicit entry `CABLE Output (VB-Audio Virtual Cable)` (the name `list-audio-endpoints.ps1` prints), confirmed by reading the selector before the orchestrator starts and again in step 13, with two Win + PrintScreen screenshots copied into the evidence folder. `System default ...` is **not accepted** for the scored run.
4. **Microphone legacy (timestamped) view found no lead marker; the sample-continuous view did.** Analysis below. *Disposition:* no code, manifest rule or threshold change is needed; reported, not a validity condition.

## Finding 4: legacy-view marker miss

**How the scoring uses the two views (code, `marker_clock.py`, commit 76768d5):** line 196, `valid = mapping['valid'] and amended['valid']`, where `amended` is the report on the **sample-continuous** view (`report(continuous, False)`, line 185). The legacy view is computed as `original = report(timestamped, True)` (line 183) and attached as `'original_timestamped': original` (line 203), but it does **not** enter `valid` or `latency`. Downstream, `analyze-bounds.py` reads only `clocks.get('sample_continuous', {})` (lines 318 and 328: search offset and `lead_marker_anchor`). A search of `scripts/` finds `original_timestamped` used only in reports and tests. The amendment (`gate-3-windows-v3a-clock-amendment-proposed.md`, section 1) says: "applied on the sample-continuous view ... The result on the timestamped view is also reported. Neither is deleted." So the legacy-view marker is **reported, not required, not a cross-check that can fail the clock, and not used in the fit.** (The sample-continuous view is required: both its markers, plus the 100 ms disagreement rule.)

**Why the legacy view missed it (rehearsal-1 microphone, offline decode of the preserved chunks, no audio played):**

- Sample-continuous view: lead marker found at 1.520 s (pulses 1.520-1.715, 2.020-2.215, 2.520-2.715).
- Legacy view: runs 1.525-1.725, **2.025-2.065, 2.070-2.225**, 2.530-2.725. Pulse 2 is split in two, so the three-pulse pattern is not met: 0 candidates.
- Cause: chunk 0 ends at 2.0670 s and chunk 1 is stamped to start at 2.0700 s, a **2.0 ms gap** that the legacy view fills with 97 zero samples. It falls inside pulse 2 (2.020-2.215).
- Test: in the continuous view, a zero hole inside a random pulse removed the marker in 0/40 trials at 0.5 ms, 14/40 at 1.0 ms, 38/40 at 2.0 ms and 40/40 at 3.0 ms; a 2 ms hole in the silence between pulses removed it in 0/20. A gap inside a pulse explains the miss; overlaps (last chunk wins) were not the cause here. The continuous view is not affected because it joins decoded samples without inserting zeros.
- The microphone track has gap events of 2.0-2.5 ms at chunk boundaries (each followed about 8 ms later by an overlap of the same size): 2.070, 10.780, 11.760, 16.549, 16.930, 22.650, 23.280, 27.070, 34.930 s (**9 gaps of 2.0-2.5 ms**), plus a 7.5 ms start offset at 0.007 s and a 1.8 ms gap at 54.939 s. The meeting track had one 10 ms start offset and no gap of 1 ms or more. Only the 2.070 s gap lies in the lead marker's pulses (1.52-2.715 s); the next is at 10.78 s.
- Meeting track: continuous 1.465 s, legacy 1.475 s (the 10 ms start offset).

**Retained practice recording (`practice-d2`, 449.3 s), same two-view detection:** both views found both markers on both tracks. Microphone: lead 4.695 / 4.695 s (continuous / legacy), trail 384.775 / 384.905 s. Meeting: lead 4.655 / 4.655, trail 384.645 / 384.855. No gap lies in either marker window. (The legacy trail positions differ from the continuous ones by 0.13 and 0.21 s because of earlier larger gaps: the microphone has a 161 ms gap at 141.9 s; the meeting track a 209.5 ms gap.)

**Rates, counting gaps of 1 ms or more (chunk 0 start excluded):**

| Recording | Microphone gaps | Per minute | Meeting gaps |
| --- | --- | --- | --- |
| rehearsal-1 (59.8 s) | 10 | 10.0 | 0 |
| practice-d2 (449.3 s) | 32 | 4.3 | 1 |

Practice by minute (microphone): 3, 6, 8, 3, 3, 3, 1, 5, so the rate is not highest at the start; the startup-gap hypothesis is **not supported** by the practice run. Rehearsal-1 had 9 of its 10 gaps in its first 35 s (15 per minute), 1 later. Neither is clearly representative: practice is the longer sample, but rehearsal-1 is the only run with the orchestrator, observer, overlay, frame capture, sampler and Snipping Tool video encoding all running during capture. Whether that extra load raised the rate is an untested hypothesis (practice-d2's helper load was not checked here), and a third run is needed to say.

**Could a scored run come out clock-INCONCLUSIVE for this reason?** Not from the legacy view: it does not enter `valid`. It could come out INCONCLUSIVE if the **sample-continuous** view fails (missing or ambiguous marker, or offset disagreement plus anchor uncertainty above 0.1 s). A gap of 1-3 ms does not break the continuous view (above). What the rehearsal does not rule out is a large gap, such as practice's 161 ms microphone gap, moving the trail marker's offset by more than 100 ms; that is an existing, known mechanism of the amendment, not a new one. To rule it out one would need to know the gap rate under full scored-run load over 7 minutes and the size distribution of gaps; only a scored-length run or a long rehearsal at full load would show it. Rough exposure if gaps of 2 ms or more at the rehearsal-1 rate (10 per minute) hit a legacy marker (0.6 s of tone per marker): about 10% per marker per track (4% at the practice rate); this matters only for the reported legacy result.

**Proposal (marked as a proposal, for the owner; not applied):** none needed for validity. Optional: the scorer's report already carries the legacy result; a miss on the legacy view alone should be reported as "legacy view: marker missing (gap inside pulse)" and not as a clock defect. No manifest or threshold change is proposed.

## First-overlay-frame check applied retroactively (manual, unscored)

Owner report: in `screen-recording.mp4` the first frame shows the Meeting Scribe window without the clock overlay (the window's title bar is cut off, as expected: the region the script drags starts 12% down the screen); the overlay first appears about 2 s into the video; its time advances, including at the 10 s mark. The owner did not report the overlay reading on that frame.

From `actions.log` and the file: `origin_qpc` 1337267083728; overlay process started at tick 1337269532838 (UTC 19:37:59.471), so the overlay's first possible reading is (1337269532838 - 1337267083728) / 10,000,000 = **0.245 s** plus 0.5-1.5 s for PowerShell and Windows Forms start-up: **expected first reading about 0.75-1.75 s**. The video file ends at UTC 19:39:40.43 with duration 103.03 s, so it began at about 19:37:57.4 (container `creation_time` 19:37:57), which puts the origin at about 1.8 s into the video and the first overlay frame at about **2.6-3.6 s**. The owner's "about 2 s" is about 0.6-1.6 s earlier than that: **consistent only roughly**, within a coarse by-eye estimate plus the 1 s uncertainty of the start time; the overlay reading on that frame would settle it (it should be about 0.2 s if the owner's 2 s is exact, outside the 0.75-1.75 s range, or inside it if the overlay appeared at 2.6-3.6 s). *Open: ask the owner for the first overlay reading in rehearsal-1.*

**Snipping Tool Start versus first overlay:** Start was invoked at 19:37:52.556; the observer started 6.04 s later (19:37:58.594) and the overlay 6.9 s later (19:37:59.471). With the video starting at about 19:37:57.4, recording began about 4.4-5.4 s after the Start invocation. The Snipping Tool's own 3 s countdown explains most of that; the remaining 1.4-2.4 s is not explained by the logs (UI start-up latency is a hypothesis). The two statements are **consistent**: the video starts before the observer and overlay, as designed, and the overlay appears 2.1 s of video after the start at the earliest plus start-up time.

## Other observations (not validity conditions; open)

- `actions.log` recorded `level meters within 10 s of Record: mic max 0, meeting max 0` although audio was captured and decoded (markers found). The orchestrator only logs this value. Whether the app's meters were unreadable through UI Automation or were genuinely zero is not determined.
- `snipping timer text:` was empty at every read. The orchestrator only logs it. The video is 103.03 s and ends at Stop.
