# Gate 3 evaluation checklist (preliminary)

**Status: not evaluated.** Gate 2 is approved. This is scoring support, not Gate 3 evidence or approval. Base: `639a25e` (2026-11-01). Do not substitute Phase 0 simulated delay, synthetic fixtures, or five-second saved chunks for the actual Phase 3 live feed described in `docs/plans/task-17-live-transcription-bridge.md`.

## Reuse before measuring

| Existing tool | What it already covers |
| --- | --- |
| `phase0/scripts/score_ami_wer.py` | AMI reference extraction, text normalization and WER edit counts (reused by the new scorer) |
| `phase0/scripts/simulate_live_delay.py` | Phase 0 real-time whisper-server replay and per-segment `delay_s` JSON; **simulation, not production Gate 3 evidence** |
| `phase0/scripts/score_der.py` | Later speaker accuracy work; not a Gate 3 requirement |
| `packages/transcription/test/live.test.ts`, `worker.test.ts` | Fake-worker queue overflow, restart, bounded failure and process exits |
| `packages/transcription/test/import.test.ts` | Format decoding, cancel, failure cleanup and recording priority; does not prove installed-machine final-pass accuracy |
| Desktop transcript tests and Phase 0 worker-crash reports | UI behavior and early isolation feasibility; neither proves a production worker kill during Phase 3 capture |

`phase0/scripts/evaluate_gate3.py` only adds paired live/final WER, median/p95 delay and structured worker-failure scoring. It does not run transcription, kill workers, inspect captured audio or approve a gate. Inputs/results stay **outside git** when they involve recordings or transcripts.

## Reproducible scoring

Run `python -m unittest discover -s phase0/scripts -p 'test_evaluate_gate3.py'`, then on each machine:

```sh
python phase0/scripts/evaluate_gate3.py /private/gate3/windows.json > /private/gate3/windows-score.json
# On macOS use its own independently recorded macos.json and output.
```

The manifest paths are relative to its folder. An example **shape, not recorded evidence**:

```json
{
  "origin": "production",
  "clips": [{"id": "public-clip-1", "reference": "reference.txt", "live": "live.txt", "final": "final.txt"}],
  "delay_file": "delays.json",
  "worker_file": "worker.json",
  "peak_app_memory_mib": 5000
}
```

- `reference` may instead be `"ami": {"annotations": "AMI-annotations", "meeting": "ES2004a"}`. Reference, **unaltered** live output and pre-correction final output must cover the **same exact clip and audio interval**. The scorer pools edit counts across clips rather than averaging WER percentages; an empty live transcript cannot count as an accuracy pass.
- `delays.json`: `{"rows": [{"delay_s": 1.2}, ...]}`. For *actual app* measurements, `delay_s` is first availability of a live segment minus the end of its speech, using one aligned monotonic time base. Record raw observations for both tracks. The scorer reports median, nearest-rank p95 and the share at or below six seconds. Phase 0 simulator JSON can be read for comparison, but **cannot** close Gate 3.
- `worker.json`: `{"cases": [{"id": "kill-1", "killed_during_audible_capture": true, "recording_continued": true, "saved_audio_lost_ms": 0, "audio_continuity_verified": true, "live_lag_or_failure_visible": true, "restart_attempts": 1}]}`. Values must come from independently saved capture verification and status/restart logs, **not inferred from the scorer**. `saved_audio_lost_ms` is the measured loss attributable to the kill across **both** saved tracks. Attach trace paths and the recording-stop result separately for reviewer audit.
- `origin: "synthetic"` is for tests only. The scorer echoes the origin label; it does not verify that production data is genuine. A numeric pass is **not** a Gate 3 decision. Missing sections output `null`.

## Remaining local checks — repeat on Windows and macOS

| Evidence to capture on **each** machine | Pass criterion |
| --- | --- |
| Real production live-to-display delays, `delay_s` per segment, plus med/p95 and number within six seconds | Median **<=3.0 s** and **>=95%** of segments within **6.0 s** (p95 reported; the proportion is the decisive tail test) |
| Public AMI or invented speech clips with one reference and both actual live and final transcripts, same audio; report WER and raw edit counts | Final pass has **>=15% fewer word errors**, aggregated across paired clips; no empty live outputs. The current plan has **not** waived this target for GPU machines |
| Peak total app + capture + live worker memory during active recording/transcription, with process list and sample timestamps | Approximately **<=6 GB** for the whole app; record units and let the owner review borderline results |
| Final-pass wall time and clip audio duration, including GPU availability | Final pass **<=audio duration on a GPU-capable machine**; report CPU-only result without claiming this threshold there |
| Kill/hang the actual speech worker during audible two-track recording; record restart/status events and separately verify both saved audio tracks and Stop | Capture continues; **zero audio lost due to worker failure**, live lag/failure visible, **<=3** restart attempts; workers never block saved audio |
| One **4-hour** real recording with Phase 3 live load active; restart/failure observation can be combined where safe | Complete, saved audio verified and gaps reported; not a replacement for the shorter audible worker-kill test if speech is absent |
| Import **WAV, MP3, M4A/AAC, M4A/ALAC, FLAC, Opus and Ogg**; record final text, word timings, accuracy and elapsed time against the same reference where applicable | Each supported type produces a usable final transcript; final quality/time meet the targets above where applicable. No separate absolute import WER cutoff is specified |
| Cancel mid-import and inject decoding/final-pass failure; inspect the library and filesystem | **Nothing** from the failed/cancelled import remains; source untouched. A recording in progress takes priority |
| Exercise provisional You/Meeting text, lag/failed status, click-to-play timing and an 8-hour paged transcript; time Record/Pause/Stop under AI load | Correct states/playback, responsive transcript; Record/Pause/Stop each **<=200 ms** |

**Blockers as of this draft:** the real low-latency live bridge, isolated native feed, worker lifecycle integration and local instrumentation are not yet verified on both machines. No production Gate 3 WER, delay, memory, kill or import final-pass results are supplied here. Complete physical-machine checks and independent Claude Code QA before asking the owner for a gate decision. Run long tests in parallel with independent work where practical; do not use a Phase 0 benchmark as a substitute.
