# Gate 3 Windows: memory and worker-kill run on BCHEN-W10 (runbook, DRAFT, 2026-11-15)

**Status: DRAFT. Nothing here has been run on W10.** The tool below is tested only against invented stand-in processes on Regiurn. This run needs the owner's explicit approval of its total time before it starts (AGENTS.md: more than 20 minutes needs approval; the planned total below is about 25 minutes). If any step fails or is inconclusive, stop and report; do not rerun automatically. No private recording or owner meeting audio is used: invented speech (or AMI) only.

Why W10: Regiurn has no virtual-cable route, no built capture helper and no copy of the invented source audio (`gate-3-windows-memory-worker-kill-20261115.md`). W10 has the cable, the Realtek speakers and the pinned source WAVs.

## What is checked (from `windows-gate3-remaining-20261115.md` rows 2 and 4 and the Gate 3 text)

1. **Memory:** peak whole-app memory (main, renderer, GPU, capture helper and the live worker `whisper-server`) while two tracks record with live transcription, against the plan's target of about 6 GB or less (6,144 MiB). The tool reports the peak of the summed working sets and the peak of the summed private bytes; the working-set sum counts shared pages more than once, so private bytes is the lower figure. Both are reported. The earlier Windows figure (1,973 MiB) was a final pass, not this.
2. **Worker kill:** while audible audio plays on both tracks, kill the live worker once. Then: the finished chunks saved before the kill have identical SHA-256 afterwards; chunk numbers are continuous on both tracks; no `.part` file is left; both tracks sealed; no lost-audio gap in the transcript; the meeting status is `ready`; and the live worker runs again, or the owner records what the app said on screen.

## The tool

`scripts/gate3-retest/memory-worker-kill.mjs` (plain Node, no dependency; Node 22 on the process PATH). It prints numbers and fixed codes only, writes into a new folder outside Git, and reads no meeting text.

- `watch`: samples every few seconds; **creating a file named `KILL` in the evidence folder kills the live worker once**, but only if a recording is in progress, a `whisper-server` process exists under the app, and both tracks already have finished chunks (otherwise it logs `KILL refused` and you create `KILL` again later). Before killing it hashes every finished chunk. `STOP` (or `--seconds`) ends it and writes `summary.json`.
- `verify`: run after the app's Stop; writes `verify.json` with `RESULT` PASS, FAIL or INCONCLUSIVE.

## Steps (Windows PowerShell 5.1, not Administrator; Window A for commands, the app in its own window)

1. **Clean checkout of the commit under test** (current `main` plus this PR's script). Write the commit hash in the evidence note. The tested build must be the final build, not the old pinned November candidate. How W10 launches it (packaged `Scribe.exe`, or `npm run start` in `apps/desktop` with the development assets and `config\live.json`) is **unverified**; use what W10 used last and record it.
2. **Audio route as in `gate-3-windows-scored-run-runbook-20261110.md` steps 6, 7, 9:** default playback = Realtek speakers (not Bluetooth), volume 10; recording device CABLE Output; `list-audio-endpoints.ps1`, then the `play-sources.ps1` dry run (plays nothing) with the pinned WAV hashes it prints in that runbook (`microphone.wav` 1163ac30..., `meeting.wav` 3353007a...; the files are in W10's `renders-units-20261109-r3-derived-1\assembly`). Only the playback script from that runbook is used; **the scored-run orchestrator is not used** (it pins the old candidate and measures latency, which this run does not).
3. **Launch the app with a fresh profile**, open the Live screen and choose the microphone entry named exactly `CABLE Output (VB-Audio Virtual Cable)` (not "System default"). Leave system audio on whole computer. Find the app's main PID (`Get-Process electron | Where-Object { $_.MainWindowTitle -like '*Scribe*' }` or `Scribe.exe`) and the library folder, the one that contains `meetings\` (`<library>\meetings\<id>\meeting.json`).
4. **Start the watcher** (Window A):

   ```powershell
   node scripts\gate3-retest\memory-worker-kill.mjs watch --app-pid <PID> --library '<library folder>' --out 'C:\...\gate3-memkill-<date>' --seconds 600 --interval 3
   ```

5. **Press Record in the app, then start the playback** (`play-sources.ps1 -OutFolder <new folder> ...` with both WAVs as in the runbook). Audio is audible on both tracks for 420 s.
6. **At about 2.5 minutes** (both tracks have several finished 5 s chunks and audio is audible), create the kill trigger from a second PowerShell window: `New-Item '<evidence folder>\KILL' -ItemType File`. Check `events.log` says `KILLED live worker`. Watch the Live screen for the next minute and note, in words for the evidence note, what the app showed (live text resuming, or a message).
7. **After playback ends (420 s), press Stop** in the app and wait until the meeting shows `ready`. Create `STOP` in the evidence folder; the watcher prints its summary.
8. **Verify:**

   ```powershell
   node scripts\gate3-retest\memory-worker-kill.mjs verify --out '<evidence folder>' --meeting '<library folder>\meetings\<id>'
   ```

9. Copy only the numbers (peak working set, peak private bytes, kill time, restart time, the `verify` checks) into a new evidence note; keep the raw folder outside Git per `evidence-retention-policy.md`. A draft PR, never merged by the agent.

## Planned time (estimate, not measured)

Checkout and route checks about 8 min, run about 9 min (420 s of audio plus start, kill window and Stop), verify and notes about 5 min, cleanup about 3 min: **about 25 min**. Needs the owner's approval before it starts; stop at 125% (about 31 min).

## Pass conditions and limits

- **Memory:** peak private bytes and peak working-set sum both at or below 6,144 MiB. If only the working-set sum is over while private bytes is under, report both and let the owner decide; do not call it a pass or a fail.
- **Kill:** `verify` says PASS and the worker ran again or the app said so. A worker that does not restart and no on-screen message is reported as it is.
- One run covers one recording of about 7 minutes: a peak over a short run is a lower bound for a long meeting, not a 4-hour figure. Say so in the note.
- The sampler cannot see GPU memory. The memory target is about the app's own processes.
