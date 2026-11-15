# Gate 3 Windows: memory and worker-kill run on BCHEN-W10, 2026-11-15: results

**Result: memory under target on both measures; worker kill PASS.** One recording of about 7 minutes (420 s of audio); a lower bound for a long meeting, not a 4-hour figure. Numbers, hashes and statuses only; no transcript text. Raw evidence stays outside Git (`docs/gates/evidence-retention-policy.md`) in an evidence folder named `gate3-memkill-20261115-*` on BCHEN-W10.

## What was run

| Item | Value |
| --- | --- |
| Build under test | commit `b7b4d11aafc1279e0323b7e97fc6fb25bd3957f1` (branch of draft PR #277: current `main` `f258188f` plus the runbook, sampler and verifier), clean worktree, `npm ci`, `npm run build` in `apps/desktop`, Node 22.23.5 on the process-local PATH |
| How launched | **Development launch, not the packaged `Scribe.exe`:** `electron.exe` from the worktree's `node_modules`, `apps\desktop`, fresh `--user-data-dir` profile and library, `SCRB_LIVE_CONFIG` and `SCRB_FINAL_PASS_CONFIG` pointing at the earlier scored runs' reference config (live-config SHA-256 `ac4c719def84647f3b857c346507041f7995a144713da96ea17464c6020531e0`; live model `ggml-base.en-q5_1`, CPU, 6 threads) |
| Capture helper | rebuilt from current source with `native\windows-capture\scripts\build.cmd` (the existing binary dated 2026-10-31 was older than the source); SHA-256 `5a903201fd00b181e65b83857eaf525eeb897c5c00917145041a5346cf9466d4` |
| Audio route | default playback Realtek speakers, volume 10 and microphone "CABLE Output (VB-Audio Virtual Cable)" chosen in the app (both confirmed by the owner); `play-sources.ps1` dry run passed (both formats accepted, mic to CABLE Input, system to Realtek) before the real playback; scored-run orchestrator not used |
| Source audio | invented r3 WAVs, SHA-256 matched: microphone `1163ac30b91b1fd55bc5dae9eb870bad05c6f4bdd1dddce44002265aadeb80d4`, meeting `3353007a875395eb1d3a59a47c32fd1e19271304041406d833faae6f697deab7` |
| Times (machine clock) | watcher start 00:58:36; playback start 00:59:35; kill 01:02:06; Stop in app about 01:07:25; watcher ended on its own at 01:13:38 (`--seconds 900`); status `ready` seen 01:19:05 |

## Memory (sampler, every 3 s, 211 samples, all Scribe processes including the live worker)

| Measure | Peak | Target | Within |
| --- | --- | --- | --- |
| Sum of working sets | 1,405.1 MiB (at 716.6 s) | 6,144 MiB | yes |
| Sum of private bytes | 1,801.2 MiB | 6,144 MiB | yes |

Both are under the target, so no split decision arises. Private bytes came out *higher* than the working-set sum here, the opposite of the tool's note that private bytes is the lower figure; no explanation was investigated. The watcher ended 902 s after it started, before the final pass finished, so memory during the last minutes of the final pass was not sampled. GPU memory is not visible to the sampler.

## Worker kill

- Killed once at 209.3 s after watcher start (live worker pid 24760) with 76 and 36 finished chunks on the microphone and meeting tracks. A live worker was running again 4.1 s later (new pid 41708).
- `verify` RESULT **PASS**: the 112 chunks finished before the kill have identical SHA-256 afterwards (none changed, none missing); chunk numbers continuous on both tracks (microphone 223 chunks, meeting 102); no `.part` file left; both tracks sealed; no lost-audio gaps; meeting status `ready`.
- Owner report of the Live screen after the kill: live text kept going, no message.

## Hashes of the raw evidence (files stay outside Git)

`summary.json` `804e472ed831a880520bd0482218cedd70e6827f5be908d9f15976b3b3cf6965`; `verify.json` `6dce3c2029b427792a695a9ea1b91a00b8498f5eecd7117317a791ca3f9c9cae`; `samples.csv` `a0973bfe25e4ab6f0305d1a2ec85952aa038ebb8428bb33017af8f50265c16ed`; `pre-kill-hashes.json` `1a5c991f4744696e00025f342cbe559ce27c28f55e5b16d7ec0a52c949fc5191`.

## Limits and process notes

- One run, about 7 minutes; the final pass is included only until the watcher stopped. No rerun was made.
- Total wall time was about 31 minutes against the approved 25 (limit 31), mostly the final pass after Stop (status `ready` at 01:19:05) plus about 8 minutes of build and setup; the run itself followed the plan.
- The owner could not watch the PC after the kill, so the agent pressed Stop on the app's recorder window by a scripted mouse click; Record, microphone choice and volume were the owner's.
- Incident A-412 records a playback step run as a dry run by mistake.
