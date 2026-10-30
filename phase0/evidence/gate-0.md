# Gate 0 Evidence

Status: **In progress; macOS long-run and device cases still required**

This is Phase 0 throwaway evidence.  No production application code has been
created in `C:\Users\brand\Documents\GitHub\scrb`; Phase 1 remains gated.

## Build and Source IDs

- Meeting Scribe production commit: not created; Phase 1 has not started
- Meetily: `a2cb62e827da7ef59f65064c97233efb2313878e`
- Microsoft ApplicationLoopback sample:
  `434f6002bdf9cf9829406c3ff2b33387982d6168`
- whisper.cpp: `284029c07012d2000941a08d38a31ffb71f4734e`
  (`1.9.5-dev`)
- sherpa-onnx: `af2d8d81dbfa61c4cea4c568da78f3982edca005`
  (`v2.0.1`)

## Framework Test

Meetily v0.4.1 does not implement the required per-application capture contract.
Its Windows path enumerates endpoint devices and its macOS Core Audio path
creates a mono global tap.  Its recording pipeline also mixes sources for the
transcription path rather than providing the required crash-safe, original,
separate mic and meeting-app chunk streams.  Therefore the Meetily fork cannot
pass framework decision rule 1 without replacing its capture architecture.

Provisional framework decision: Electron with project-owned capture adapters.
This becomes final only when the remaining Gate 0 measurements are complete.

## Windows Machine

- OS build: 26300.9711
- GPU: NVIDIA GeForce RTX 3080, 12 GB VRAM
- Vulkan: 1.4 available
- CPU: 28 logical processors
- Toolchain: MSVC v143, Windows SDK 10.0.26100.0, CMake 3.31.6,
  Ninja 1.12.1, Rust 1.99.1

### Per-application capture

The official Microsoft ApplicationLoopback sample was built from source and
tested against a native tone generator.  A selected 880 Hz process was captured
while a separate 440 Hz process played concurrently.

| Test | Duration | Target/leakage | Result |
| --- | ---: | ---: | --- |
| Selected process only | 9.99 s | 78.617 dB | Pass |
| Parent PID including child audio | 9.98 s | 83.351 dB | Pass |

Both outputs are stereo, 44.1 kHz, 16-bit PCM.  Evidence is in
`artifacts/capture/`.  These results establish that Windows process and process-
tree loopback isolation are feasible.

### Microphone and short dual-track capture

The official Microsoft shared-event WASAPI capture sample was built and run
against the default communications microphone.  The command-sandboxed probe
received `0x80070005`; after the owner enabled microphone access, the same probe
in the normal desktop session wrote a valid 5.0-second, 48 kHz microphone WAV.

A subsequent synchronized feasibility run wrote separate 10-second app and
microphone tracks.  The two capture processes were launched 19.597 ms apart.
The app track captured the selected 880 Hz tone process and the microphone track
was written independently.  Evidence is in `artifacts/capture/dual-track-*.wav`
and the paired stdout logs.

This is a short-run proof only.  It does not establish the required drift,
device-change, sleep/wake, Bluetooth-headset, or eight-hour behavior.

### Capture resilience spike

The duration-enabled Phase 0 loopback probe and the microphone probe captured
for two minutes while an independent worker process terminated abruptly with
exit code `0xDEAD` after 30 seconds.

| Measure | Result |
| --- | ---: |
| App-track duration | 119.98 s |
| Microphone-track duration | 120.00 s |
| Capture-process launch offset | 29.321 ms |
| Worker launch offset | 41.876 ms |
| Worker termination time | 30 s after launch |
| Loopback exit code | 0 |
| Microphone exit code | 0 |
| Average combined capture CPU | 0.033% |
| Peak capture-process working set | 54.4 MiB |
| App target/unrelated-tone ratio | 83.748 dB |

Both capture files reached their requested endpoint after the worker failure.
This validates the intended independent-process failure boundary.  It is not a
substitute for killing the eventual transcription worker inside the production
application, so the formal Gate 0 worker-crash checklist item remains open.

### Whisper benchmarks

The 11.0-second official JFK sample was transcribed with CPU-only whisper.cpp
using 14 threads.

| Model | File size | Wall time | whisper time | Peak working set | Transcript |
| --- | ---: | ---: | ---: | ---: | --- |
| `small.en-q5_1` | 190,098,681 B | 1.877 s | 1.633 s | 480.8 MiB | Correct words; lighter punctuation |
| `large-v3-turbo-q5_0` | 574,041,195 B | 5.990 s | 5.690 s | 811.0 MiB | Correct words and punctuation |

Observed SHA-1 values:

- `small.en-q5_1`: `20F54878D608F94E4A8EE3AE56016571D47CBA34`
- `large-v3-turbo-q5_0`: `E050F7970618A659205450AD97EB95A18D69C9EE`

The large-model hash matches the upstream published value.  These are batch
benchmarks, not proof of the plan's streaming-latency or accuracy targets.

### Speaker diarization benchmark

sherpa-onnx v2.0.1 was run CPU-only against its official 56.861-second,
four-speaker sample using int8 Pyannote segmentation and the 3D-Speaker
embedding model.  It completed in 3.021 seconds (reported RTF 0.050), peaked at
177.1 MiB working set, and emitted 10 segments across all four requested
clusters.  Model files total 41,134,267 bytes.

This proves offline resource feasibility only.  It does not establish live
incremental clustering quality or the plan's DER target; the live diarization
gate remains open.

### Single-process dual-track probe (Claude Code, 2026-10-28)

`probes/windows-dual-capture/DualCapture.cpp` captures a process tree
(process loopback, include-tree) and the default communications microphone in
one process, as mono 16-bit 48 kHz WAVs, with a per-packet timing log against
QueryPerformanceCounter (QPC): each packet's device QPC stamp, its arrival
time, frames written before it, and discontinuity flags.  Detected gaps are
padded with silence.  It holds `ES_SYSTEM_REQUIRED` for the run, as the
recorder must.

- A silent target process still delivers continuous (zero) packets, so a quiet
  meeting app does not create gaps.
- The process-loopback stream's QPC stamps are exactly frame-derived (effective
  rate 48000.0000 Hz), so arrival time is used as the independent check on that
  track; it agrees within 1 ms per hour.

### 60-minute capture with real whisper.cpp worker kills

`scripts/run-dual-capture-stress.ps1`: 880 Hz tone process plus mic for
3,612 s while CPU whisper.cpp `large-v3-turbo-q5_0` (20 threads) was started
every 30 s and force-killed at a random point when still running.  The machine
was also compiling llama.cpp/libopus and running diarization and LLM jobs.

| Measure | Result |
| --- | ---: |
| Whisper runs / force-killed mid-transcription | 120 / 16 |
| Capture exit / HRESULT | clean / `S_OK` both tracks |
| App-track discontinuities | 0 |
| Mic-track discontinuities | 10 events at ~1052 s and ~1712 s; 16.0 ms padded |
| Longest wait between packets | 68.4 ms app, 69.2 ms mic |
| Capture CPU (whole machine, 28 logical) | 0.022% |
| Capture peak working set | 11.3 MiB |
| Mic clock vs QPC | -4.68 ppm (mic slow) |
| Sample-count drift, mic vs app, at 60 min | 16.9 ms |
| Projected sample-count drift at 8 h | 134.8 ms (exceeds 100 ms target) |
| Drift with a QPC start stamp per 5 s chunk | 0.014 ms at end; <=1.1 ms except one 19 ms row inside the chunk holding a glitch |

The mic glitches did not coincide with worker kills; they coincided with the
llama.cpp build and 5 GB model memory-mapping.  The device position counter
skipped the same frames, so it cannot detect gaps; QPC stamps can.

**Design consequence:** tracks must be aligned by per-chunk device timestamps,
not by sample count.  Storing the QPC (macOS: host time) of each chunk's first
frame keeps sync error near 1 ms indefinitely and self-heals undetected losses
at the next chunk boundary (`scripts/analyze_alignment.py`).

### Eight-hour drift run

`DualCapture.exe` against a silent target process plus the default mic,
2026-10-28 17:12 to 2026-10-29 01:12 (28,837 s), on the same machine while the
whisper, diarization and LLM benchmarks in this document ran alongside it
(CPU and GPU).  Analysis: `scripts/analyze_alignment.py`, 5 s chunks.

| Measure | Result |
| --- | ---: |
| Capture exit / HRESULT | clean / `S_OK` both tracks |
| Capture CPU (whole machine) / peak working set | 0.023% / 12.1 MiB |
| App-track discontinuities / padded audio | 0 / 0 s |
| Mic-track discontinuities / padded audio | 88 / 160.3 s (0.56% of the run) |
| Longest wait between packets | 13.7 s app, 13.8 s mic |
| Mic clock vs app, whole run | +0.44 ppm (the 60 min run measured -4.68 ppm) |
| Sample-count sync error, mic vs app | -122 to +13 ms; within 2 ms for 39% of logged packets; 12.7 ms at the end |
| Chunk-timestamp sync error, mic vs app | within 2 ms for 99.95% of logged packets; 0.002 ms at the end |
| Chunk-timestamp error episodes over 2 ms | 5, each inside one chunk (<= 5 s): 18.6, 16.0, 125.0, 60.0, 10.6 ms |

- **Drift is solved by per-chunk timestamps.**  Over 8 h, sample-count
  alignment wandered up to 122 ms off (above the 100 ms target) because of mic
  glitches and clock wander; per-chunk QPC stamps stayed within 2 ms except
  inside the five chunks that held a glitch, and recovered at the next chunk
  boundary every time.
- **Whole-process stalls of 3--14 s happened 23 times**, both tracks at
  once, with the capture thread already at MMCSS "Audio" priority.  Fifteen
  fell between 5.55 and 5.64 h, during the GPU benchmark runs; the rest were
  spread from 1.8 to 6.7 h while other benchmarks ran (large model loads, GPU
  work, many CPU threads).  The app (process-loopback) track
  lost nothing: Windows buffered it through every stall.  The mic track (200 ms
  shared-mode buffer) lost the audio of each stall, 160 s in total, padded
  with silence at the correct time.
- No idle sleep occurred (`ES_SYSTEM_REQUIRED` held for 8 h).

**Design consequences for Phase 2:**

1. Store each chunk's first-frame device timestamp (already the plan) and also
   start a new chunk at every discontinuity, so no chunk spans a glitch.
2. Give the mic stream a larger buffer (for example 1--2 s) and keep capture in
   its own small process at MMCSS priority; record padded spans per chunk so
   the transcript can mark "audio missing" instead of treating it as silence.
3. Expect mic loss when the same machine runs heavy model loads.  The
   recorder must keep heavy AI work out of its process and lower that work's
   priority while recording, and Gate 0 does not show that a 1--2 s buffer
   avoids 10 s stalls; re-measure on the Phase 2 adapter.

### Device-state cases (second Windows PC, 2026-10-29)

Run from `HANDOFF-WINDOWS.md` with the same `DualCapture.exe` (no
device-change recovery) and `scripts/run-windows-device-case.ps1`, which
logs the default output and communications mic every 2 s.  Dell Precision
7760, Windows 11 Pro for Workstations 26H2 (10.0.26300), AC power; Realtek
speakers and mic array, AirPods Pro 3 (A2DP "Headphones", hands-free
"Headset").  300 s runs, action at about 60--80 s, output muted.  Full table
and notes: `HANDOFF-WINDOWS.md`; outputs `artifacts/capture/devices/`.

| Case | Probe | App track | Mic track |
| --- | --- | --- | --- |
| Output switch (AirPods to speakers) | ran to end, `S_OK` | tone continuous, 0 discontinuities | stayed on the AirPods hands-free mic |
| Input switch | ran to end | tone continuous | **did not follow** the new default; HFP stream lost ~222 of 298 s (604 discontinuities) |
| Bluetooth connect | ran to end | tone continuous | stayed on the Realtek mic (default comms mic moved to AirPods) |
| Bluetooth disconnect | ran to end | silent from the disconnect (the tone player's own stream died) | **stopped at 72.9 s: no packets, no error, no padding** |
| AirPods enter hands-free | ran to end | **1.4 s of digital silence, no discontinuity flagged** | Realtek mic live; 1 discontinuity at the profile switch |
| Sleep/wake (Modern Standby, 44 s) | ran to end (343 s wall for 300 s) | 42 s silent frames, 0 discontinuities, **ends 1.69 s short of the clock** | gap-filled 42 s, stays aligned (-7 ms) |
| USB mic unplug, mic privacy off | not run | | |

Voice checks (no device change): Realtek mic voice about 20 dB over room
noise; AirPods hands-free mic gates noise by about 50 dB and shows frequent
discontinuities (HFP jitter) with no lost frames in that run.

- The default communications mic flapped between AirPods and Realtek every
  ~4 s for 50 s by itself before one run.

**Design consequences for the Phase 2 Windows adapter:**

1. Listen for default-device changes (`IMMNotificationClient`) and reopen
   the mic stream on the new default, debounced (the default can flap).
2. Detect a dead stream with a packet-arrival watchdog: a removed device
   stops delivering with no error.
3. Re-anchor every track to QPC after resume and after any arrival gap:
   after Modern Standby the app track was 1.7 s off with no discontinuity
   flag, so flags alone cannot find gaps.  Per-chunk timestamps (already
   planned) plus a new chunk at every arrival gap cover this.
4. Treat Bluetooth hands-free capture as lossy: mark padded spans, and warn
   when the selected mic is a hands-free headset.

### Opus storage and CPU

`probes/opus-storage/OpusStorage.cpp` against libopus
`251d657e92fccfa3b05baec4f05756cce252fb75`: 20 ms frames, VOIP, constrained
VBR, complexity 10, with Ogg page/header overhead for 5 s chunk files.

| Input | 24 kbps MB/h | 32 kbps MB/h | Encode CPU |
| --- | ---: | ---: | ---: |
| 60-min mic capture (48 kHz) | 8.61 | 11.42 | ~1.0% of one core |
| 60-min app capture (48 kHz tone) | 10.48 | 13.56 | 0.7--1.0% of one core |
| AMI ES2004a / IS1009a / TS3003a (16 kHz speech) | 8.55 (ES2004a) | 10.70 / 14.22 / 9.74 | ~0.6--0.8% of one core |

Recommendation: mono Opus 32 kbps, 5 s chunks, about 10--14 MB per track-hour
(well under the plan's 30--60 MB estimate).  Recording-only CPU (capture plus
encode) is under 0.1% of this machine, against the 10% target.

### Custom-vocabulary hinting

20 invented terms (people, products, acronyms) in 20 sentences, synthesized
offline with two SAPI voices (`fixtures/vocabulary/`), transcribed with and
without a glossary `--prompt` plus `--carry-initial-prompt`
(`scripts/run-vocabulary-test.ps1`, `scripts/score_vocabulary.py`).

| Model | Voice | Term recall, no hint | With hint | WER no hint | With hint |
| --- | --- | ---: | ---: | ---: | ---: |
| small.en-q5_1 | David | 50% | 95% | 15.3% | 7.9% |
| small.en-q5_1 | Zira | 35% | 90% | 35.3% | 12.1% |
| large-v3-turbo-q5_0 | David | 40% | 70% | 15.8% | 10.5% |
| large-v3-turbo-q5_0 | Zira | 55% | 80% | 14.2% | 13.2% |

The glossary produced no false insertions on the JFK control clip.  Most
remaining turbo misses were whole sentences dropped at 30 s window boundaries,
not misspellings.  One unhinted turbo run repeated a sentence (a
hallucination).  Synthetic voices are a limitation; the real-meeting check
belongs to Gate 5.

### Whisper accuracy and failure modes on AMI ES2004a (17.5 min)

AMI headset-mix audio against the manual word annotations, fillers removed,
digits not normalized (`scripts/score_ami_wer.py`).  CPU, 8 threads, under
contention.

| Configuration | small.en WER | turbo WER | Turbo notes |
| --- | ---: | ---: | --- |
| Plain 30 s windows | 30.2% | 56.1% | Drops most of many windows |
| Silero VAD | 28.9% | 62.3% | "I'll go first" repetition loop, never recovers |
| Silero VAD + `-mc 0` (no text conditioning) | 33.9% | 30.0% | Stable |

Deletions dominate both models (590--640 of 2,512 reference words), mostly
backchannels ("yeah", "okay") and overlapped speech on the mixed channel.
Turbo makes 22% fewer substitutions than small.en, but whole-file WER is only
about 10% better than small.en with the same settings, short of the plan's
>=15% final-pass target.  Findings for Phase 3:

- The final pass must use VAD segmentation and no text conditioning
  (`-mc 0`); unconditioned turbo otherwise loops or skips.
- Wall time on CPU: small.en 146--158 s, turbo 363--475 s for 1,049 s of
  audio.  A GPU build is needed for the final-pass-time target; none of the
  CPU numbers here use the RTX 3080.

**Per-segment transcription (the recommended design).**  Each Silero VAD
segment (300 ms silence split, 204 segments) is sent to `whisper-server` as
its own request (`scripts/simulate_live_delay.py`):

| Pass | Model and setting | WER | CPU time per segment |
| --- | --- | ---: | ---: |
| Live candidate | small.en, 15 s encoder context (`-ac 768`) | 31.8% | 1.2 s |
| Live candidate | small.en, full context | 25.7% | 2.5 s |
| Final pass | large-v3-turbo, full context | **23.8%** | 10.7 s |

Final versus live: 25% fewer errors than the CPU-viable live setting (meets
the >=15% target); 7.5% fewer than full-context live.  On CPU the turbo pass
took 2.1x the meeting length, so the final-pass-time target needs the GPU
build.

**Live delay** (real-time replay of the first 10 min, single worker, 8 CPU
threads, CPU shared with the LLM benchmark):

| small.en setting | Median delay | p95 delay | Within 6 s |
| --- | ---: | ---: | ---: |
| Full 30 s context | 2.85 s | 7.60 s | 91.9% (fails the 95% target) |
| `-ac 768` | 1.36 s | 1.59 s | 99.2% (meets) |

On CPU, live mode needs the reduced encoder context, which costs about 6
points of WER.

**GPU (RTX 3080, official whisper.cpp b5454 CUDA 12.4 build; zip SHA-256
`afef0b881c500958921c3f5523b50e59ee2ec9b6f5cbd25b324c51ed308a957a`).**  Same segments, scripts and models:

| Measure | CPU | GPU |
| --- | ---: | ---: |
| Turbo final pass, 1,049 s meeting, per segment | ~2,180 s (2.1x meeting) | **23.6 s (0.02x)** |
| Turbo per-segment WER | 23.8% | 24.0% |
| small.en per-segment WER (full context) | 25.7% | 26.7% |
| Live delay, small.en full context, median / p95 | 2.85 / 7.60 s | **0.54 / 0.68 s** |
| Live segments within 6 s | 91.9% | **100%** |
| Live delay, **turbo** full context, median / p95 | n/a | **0.54 / 0.70 s** (100% within 6 s) |
| Final pass on diarized speaker turns instead of VAD segments (turbo) | n/a | 28.5% WER (worse) |

With a GPU, the live-delay and final-pass-time targets pass with wide margins
on Windows.  Turbo is fast enough to be the live model itself, so on GPU
machines the "final pass >=15% fewer errors than live" target has no model gap
left to measure.  Transcribing diarized speaker turns instead of VAD segments
made results worse (non-speech and overlap inside turns cause insertions).
Proposal: on GPU machines, use turbo live and keep the final pass for
re-segmentation, frozen corrections and diarization relabeling; restate the
15% target as "final pass no worse than live, plus corrections preserved", or
keep 15% only for CPU-only machines where live must use small.en.  Owner
decision.  Must be repeated with Metal on the Mac.

### Speaker diarization on AMI

`probes/live-diarization/LiveDiarize.cpp` on sherpa-onnx v2.0.1 (pyannote
segmentation 3.0 int8), scored by `scripts/score_der.py`.  DER is frame based,
overlap scored, 0.25 s collar, optimal one-to-one speaker mapping.

Final-pass (offline) DER, eres2net embedding (Chinese-trained):

| Meeting | Threshold 1.1 | Threshold 1.2 | Known count (4) |
| --- | ---: | ---: | ---: |
| ES2004a | 22.7% (7 spk) | 21.6% (4 spk) | 21.6% |
| IS1009a | 24.8% (11 spk) | 29.0% (5 spk) | 28.4% |
| TS3003a | 21.6% (11 spk) | 21.1% (6 spk) | 21.9% |

- Missed speech, almost all overlapped speech that this pipeline never
  assigns, is 8--17% on its own.  The plan's 20% target needs overlap
  handling, not only better clustering.
- Thresholds of 0.5--0.9 over-split badly (20--66 speakers), and 1.4 collapses
  to one speaker.  The usable band is narrow.
- An English wespeaker ResNet34-LM VoxCeleb embedding was not better: 29.5% /
  39.0% / 21.0% with known count.
- Offline RTF 0.08--0.17 on CPU with 4 threads; peak memory 230--840 MiB.

Live: window-cluster matching (each hop diarizes the last 30--60 s and matches
local clusters to persistent speakers by cosine similarity) gave DER 51--56%,
confusion 30--36%, and about 30% label instability on ES2004a.  It only just
kept up with real time under the contended CPU (worst hop 16 s at 10 s hops).
Rejected.

Live, incremental (`inc` mode): every 5 s, segment the last 10 s and embed
each new speech segment (at least 1.5 s of audio around it).  Each embedding
joins the most similar speaker centroid at cosine >= 0.5, otherwise it starts
a new speaker; speakers whose centroids converge are merged after each hop.
"Post-merge" scores the same segments with the labels they end up with, which
is what a periodic relabel shows.

| Meeting | Live DER | Live confusion | Post-merge DER | Relabel events | Offline DER (known count) |
| --- | ---: | ---: | ---: | ---: | ---: |
| ES2004a | 26.2% | 5.2% | 24.4% | 13 | 21.6% |
| IS1009a | 29.1% | 14.7% | 26.5% | 15 | 28.4% |
| TS3003a | 25.3% | 5.8% | 22.7% | 23 | 21.9% |

- RTF 0.03--0.04 on 4 CPU threads; worst hop 0.3--1.2 s for a 5 s hop.
  Comfortably real time.
- The raw label count is high (45--64 labels), but on ES2004a exactly 4
  clusters reach 30 s of speech (the true speaker count), and clusters under
  30 s hold only 4--7% of speech.  The UI should show a cluster as a named
  speaker only after about 30 s, and as "Speaker ?" before then.
- Join similarity 0.55 over-splits further with no DER gain; 0.3--0.4 merges
  speakers (DER 41--44%).

**Assessment:** live multi-speaker labels are usable at about 25--29% DER,
close to the offline result, with the "Speaker ?" display rule.  The final
pass relabels offline.  The plan's 20% final DER target is not met by any
tested configuration (best 21.1--28.4%), mainly because overlapped speech is
missed.  Options: accept a measured target (about 25%) or add overlap
assignment in Phase 4.  Owner decision.

### Voice-match confidence line (provisional)

`scripts/voice_match.py`: AMI reference single-speaker stretches of at least
1.5 s (no overlap) from ES2004a, IS1009a and TS3003a, giving 12 speakers.
Each speaker's profile is the mean embedding of the first half of their
segments; the second half (164 segments) are matched against all 12
profiles.  "Stranger" withholds the true speaker's profile, so any match is
wrong.

| Embedding | Threshold | Known auto-named | Known named wrong | Stranger named wrong |
| --- | ---: | ---: | ---: | ---: |
| eres2net (zh) | 0.50 | 92.1% | 0.0% | 6.1% |
| eres2net (zh) | **0.55** | **86.6%** | **0.0%** | **1.8%** |
| eres2net (zh) | 0.60 | 77.4% | 0.0% | 0.0% |
| wespeaker ResNet34-LM (en) | 0.80 | 30.5% | 1.2% | 3.0% |

Provisional line: **0.55--0.60 cosine** with eres2net meets the under-2%
wrong-match target; below the line, suggest instead of auto-assigning.  This
is optimistic because profiles and tests come from the same meeting and there
are only 164 tests (2% is about 3 segments).  Phase 4 must re-measure it
across sessions (for example, the four meetings of one AMI series).  The
English embedding is clearly worse here as well, which confirms eres2net.

### Local summary models (action items and decisions)

llama.cpp `369dcf309c8b274370e692ac2d42d9708597ae04`, CPU build, 12 threads,
24k context, flash attention, q8_0 KV cache, JSON-schema output (actions with
owner and timestamp; decisions with timestamp), temperature 0.  Transcripts
over 40k characters are split into sections and the results concatenated (the
plan's section-by-section design).  Inputs are AMI reference transcripts of
ES2016b, ES2008b and TS3012b, the AMI meetings with the
most annotated actions and decisions: 18 actions and 32 decisions in total.
Judged item by item against the AMI abstractive summaries
(`artifacts/summary/judgments.md`).

| Model | Recall (of 50) | Non-items output | Valid timestamps | Peak private / working set | CPU time per meeting |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ministral-3-8B-Instruct-2512 | **84%** | ~13% | 80/85 | 8.8 / 10.0 GiB | 17--44 min |
| Qwen3.5-9B | 61% | ~4% | 66/67 | 4.4 / 8.2 GiB | 10--25 min |
| granite-4.2-8b | 49% | ~18% | 64/67 | 9.5 / 11.3 GiB | 14--49 min |

- No model reaches the 90% recall target on reference transcripts.
  Ministral is closest.  The plan's coverage-check pass and a non-item filter
  are the obvious next steps.
- Evidence links: JSON schema plus a timestamp check catches most bad links,
  but Ministral shifted 5 timestamps by 30 minutes.  The app must validate
  every link against the transcript, as the plan's 100% target requires.
- Memory: run after Stop, one large model at a time.  The owner noted on
  2026-10-28 that most target machines have 32 GB RAM, so 9--10 GiB after Stop
  is acceptable.
- Speed: about 34 prompt tokens/s and 6 generated tokens/s on contended CPU.
  A GPU build is required.

**GPU rerun** (RTX 3080, llama.cpp b11977 CUDA, `-ngl 99`): 10--131 s per
meeting instead of 10--49 min.  Peak VRAM 8.9 GiB of 12 GiB.

| Model | Recall | Valid JSON | Notes |
| --- | ---: | --- | --- |
| Qwen3.5-9B | **80%** | 3/3 | About 5% non-items |
| Ministral-3-8B | n/a | **1/3** | Deterministic repetition loops to the token limit on this build |
| granite-4.2-8b | not re-judged | 3/3 | |

The same Qwen model and prompt scored 61% on the older CPU build and 80% here,
so recall on three meetings swings by about 20 points between builds.
**Revised proposal: Qwen3.5-9B Q4_K_M**, for stable output, the best GPU
recall and the lowest memory.  The summarizer must detect loops and retry with
sampling whatever model is used, and Phase 6 needs a larger evaluation set.
A naive coverage-check pass (re-ask with the first-pass items listed) added
only duplicates and no recall with Qwen.  A sampled retry did not rescue
Ministral's loops (`artifacts/summary/judgments.md`).

### Memory during recording (Windows, measured parts)

| Component | Peak |
| --- | ---: |
| Capture process (two tracks) | 11--12 MiB |
| Opus encoding | negligible (libopus, ~1% of one core) |
| Live speech: whisper.cpp small.en-q5_1 | 481 MiB (batch peak) |
| Live speakers: sherpa-onnx incremental | 230--840 MiB (zh model upper end) |
| **Measured total** | **about 0.7--1.3 GiB** |

The desktop shell and UI are not built yet; Electron typically adds a few
hundred MiB.  The whole-app recording budget of about 6 GB has ample headroom
on Windows.  The final pass loads turbo (811 MiB) after Stop.

## Recommendations for Gate 0 open items (owner decisions 2026-10-29: accepted, see Gate Decision)

| Open item | Proposal from measurements |
| --- | --- |
| Desktop shell | Electron (Meetily fails rule 1 at the capture architecture) |
| Live / final speech models | GPU machines: large-v3-turbo-q5_0 live and final, per VAD segment; CPU-only: small.en-q5_1 live with `-ac 768`, turbo final; `-mc 0` for whole-file passes |
| Live diarization | Incremental per-segment clustering (join 0.5) with the "Speaker ?" rule; offline relabel in the final pass |
| Summary model | Qwen3.5-9B Q4_K_M (80% recall on GPU, stable JSON, lowest memory); Ministral was best on CPU (84%) but loops on the newer llama.cpp build |
| Audio chunks | 5 s Opus chunks, mono 32 kbps per track, each stamped with its first frame's device timestamp (QPC / host time) |
| Voice-match confidence line | Provisional 0.55--0.60 cosine (eres2net), measured within meetings; re-measure across sessions in Phase 4 |
| DOCX library | Follows Electron: a Node DOCX writer such as `docx` (to be pinned in Phase 7) |
| Targets to revisit | Final DER 20% (best measured 21--28%); summary recall 90% (best 80--84% on reference text); live-versus-final WER 15% (about 10% at GPU full context); RAM guidance now 32 GB typical |

## Apple Silicon Machine

Claude Code, 2026-10-29, on the owner's Mac, overnight and unattended except
for the isolation run.

- Apple M5, 10 cores (4 performance + 6 efficiency), 16 GB, macOS 27.0.1
  (26A434), on AC power with system sleep disabled
- Toolchain: Command Line Tools, Swift 6.4, Apple clang 2100.3; CMake 4.4.4
  and Ninja from a local venv (`tools/venv`, no Homebrew)
- Builds from the pinned `upstream/` clones: whisper.cpp and llama.cpp with
  Metal (`-DGGML_METAL=ON`), sherpa-onnx v2.0.1 C API (CPU onnxruntime)
- Probes: `probes/macos-dual-capture/DualCapture.swift` compiled with no API
  fixes; `probes/live-diarization/LiveDiarize.cpp` gained POSIX timer and
  peak-memory branches (`build.sh`)

### System-audio permission (finding)

A process tap without System Audio Recording permission is not an error: it
starts, delivers packets on schedule, and every sample is zero.  macOS shows
no prompt; only coreaudiod logs "Client is not granted access to the tap".
The permission is checked against the *responsible* process.  Runs started by
Claude Code were attributed to its bundled helper
(`com.anthropic.claude-code`), not to the Claude app the owner had enabled,
so their app tracks were silent.  The isolation run was started from
Terminal.app with permission granted.  The next afternoon Terminal.app
runs were denied although the setting still showed Terminal enabled, while
the same command run in the Claude desktop app's terminal pane (attributed
to the Claude app, which has the permission) recorded audio.  Which process
macOS holds responsible decides the outcome, and the settings list does not
show it.

**Design consequence:** the macOS adapter must detect an all-zero app track
(no permission, or permission revoked mid-meeting) and tell the user, and
must request the permission explicitly rather than rely on a prompt.  The
signed app will be its own responsible process, unlike these probes.

### Per-application capture

`scripts/run-macos-isolation.sh` from Terminal.app: target afplay at 880 Hz,
an unrelated afplay at 440 Hz, 60 s, speakers muted (the tap records before
the device volume, so muting does not affect it).

| Measure | Result |
| --- | ---: |
| App-track peak | 10,288 (tone written at 9,830) |
| 880 Hz / 440 Hz power on the app track | **135.5 dB** (the unrelated app is absent) |
| Discontinuities, 5,642 packets | 0 |
| Capture CPU / peak RSS | 0.05% / 15.9 MiB |

**Pass.**

### 60-minute capture with real whisper.cpp worker kills

`scripts/run-macos-dual-capture-stress.sh` (port of the Windows runner):
afplay tone plus built-in mic for 3,620 s while CPU whisper.cpp
`large-v3-turbo-q5_0` (`-ng`, as on Windows) was started every 30 s and
force-killed when still running.  Started from Claude Code, so the app track
is timing-only (silent, see above), and the tone ran at volume 0 because the
machine was in use overnight.

| Measure | GCD-queue IOProcs, 10 worker threads | Real-time IOProcs, 10 threads | Real-time IOProcs, 8 threads |
| --- | ---: | ---: | ---: |
| Whisper runs / force-killed | 121 / 11 | 121 / 16 | 121 / 9 |
| Capture exit | clean | clean | clean |
| Load-stall events (both tracks at once) | 6 | 2 (+1 at tap start) | 2 |
| Audio padded, app / mic | 416 / 455 ms | 277 / 289 ms | 213 / 201 ms |
| Longest wait between packets, app / mic | 160 / 167 ms | 181 / 198 ms | 117 / 118 ms |
| Capture CPU (whole machine) / peak RSS | 0.09% / 16.2 MiB | 0.11% / 16.3 MiB | 0.12% / 16.3 MiB |
| Sample-count drift at 60 min / projected 8 h | 0.008 / 0.0 ms | 0.007 / 0.0 ms | 0.008 / 0.0 ms |
| Max per-chunk (5 s) timestamp error | 0.027 ms | 0.024 ms | 0.022 ms |

- Every stall matches a coreaudiod "Audio IO Overload" ("client timeout" /
  "HAL client proc exceeding io cycle budget") at the same second.  None
  coincide with a worker kill: recording survives crashed workers, but a
  CPU-saturating worker stalls the whole Core Audio IO cycle a few times an
  hour.  Unlike Windows, the app track is affected too; both tracks stall in
  the same second, presumably because coreaudiod serves both in one IO cycle.
- The first version ran both IOProcs on one shared GCD serial queue.
  Moving them to the HAL real-time thread (nil queue) cut stalls from 6 to 2
  per hour; leaving 2 cores free shortened them.  Neither removed them.
- The Windows comparison run used 20 of 28 logical processors; here the
  worker used 8--10 of 10 cores, the harsher case.  The llama.cpp and
  sherpa-onnx builds (`nice 20`) overlapped the first 3 minutes of the
  real-time 10-thread run.
- The built-in mic and speakers share one clock, so sample-count drift is
  ~0 here; this says nothing about USB or Bluetooth mics (device cases).
#### Metal worker reruns (2026-10-29 afternoon)

The same runner with `WORKER_GPU=1` (whisper.cpp on Metal), the second run
also with `WORKER_POLICY=utility` (`taskpolicy -c utility`).  Both were
started from the Claude desktop app's terminal pane with the speakers muted
(`scripts/run-muted.sh`), so **the app track carries the tone**: a 1 s probe
every minute found it in all 60 minutes of both runs.  The owner was using
the Mac during both runs.

| Measure | Metal worker | Metal worker, `utility` |
| --- | ---: | ---: |
| Whisper runs / force-killed | 121 / 0 | 121 / 0 |
| Capture exit | clean | clean |
| Stall events (app track; mic in the same second) | 3 (at 15.0, 15.6, 39.8 min) | 5 (at 5.8, 11.9, 45.2, 50.7, 50.7 min) |
| Audio padded, app / mic | 704 / 710 ms | 672 / 549 ms |
| Longest wait between packets, app / mic | 384 / 394 ms | 299 / 310 ms |
| Capture CPU / peak RSS | 0.10% / 15.5 MiB | 0.11% / 16.4 MiB |
| Max per-chunk (5 s) timestamp error | 0.027 ms | 0.027 ms |

- **No kills:** on Metal the 11 s sample transcribes in about 0.7 s (about
  2 s with model load), so the worker always finished before its kill time.
  These runs test GPU load, not crash survival (covered by the CPU runs).
- The load was light (about 2 s of GPU work every 30 s), yet the stalls were
  no fewer and somewhat longer than with the CPU-saturating worker, and
  `utility` priority did not remove them.  coreaudiod logged no "IO
  Overload" at these stalls (it did for every CPU-run stall); one coincided
  with coreaudiod restarting the speaker and mic devices.  **So these stalls
  are not caused by the worker.**  Likely sources are other activity on a
  Mac in use; the 8 h idle-machine drift run will show the baseline rate.
- The app track kept its audio outside the stalls; sync stayed within
  0.03 ms per chunk.

**Design consequence:** on macOS the adapter must pad stall gaps (a few per
hour, up to about 0.4 s, on both tracks) from host time on both tracks and
record them as "audio missing".  Worker priority alone does not prevent
them; still run the final-pass worker on Metal with a QoS below the capture
threads, which costs nothing.

Outputs: `artifacts/capture/macos/stress-60min{-gcdqueue,,-t8,-metal,-metal-utility}-*`
(summary, timing CSV, worker log; the WAVs are kept locally only).

### Whisper on AMI ES2004a (Metal)

Same segments, scripts and models as the Windows runs; whisper.cpp Metal,
4 threads.

| Measure | Windows CPU | Windows RTX 3080 | **Apple M5 Metal** |
| --- | ---: | ---: | ---: |
| Turbo final pass, 1,049 s meeting, per segment | ~2,180 s | 23.6 s | **88 s (0.08x)** |
| Turbo whole-file pass (VAD, `-mc 0`), wall | 363--475 s | n/a | **23.5 s (0.02x)** |
| Turbo per-segment WER | 23.8% | 24.0% | 23.7% |
| Turbo whole-file WER (VAD, `-mc 0`) | 30.0% | n/a | 23.8% |
| small.en per-segment WER (full context) | 25.7% | 26.7% | 27.0% |
| small.en whole-file WER (VAD, `-mc 0`) | 33.9% | n/a | 25.3% |
| Live delay, small.en full context, median / p95 | 2.85 / 7.60 s | 0.54 / 0.68 s | **0.44 / 0.52 s** |
| Live delay, turbo full context, median / p95 | n/a | 0.54 / 0.70 s | **0.73 / 0.78 s** |
| Live segments within 6 s | 91.9% | 100% | **100%** (both models) |
| Peak memory, whole-file pass | | | small 0.65 GiB, turbo 0.97 GiB footprint |

The live-delay and final-pass-time targets pass on the Mac with wide margins,
and the GPU-machine proposal (turbo live and final, per VAD segment) holds.
The whole-file turbo pass is faster than per-segment requests here (one
model load, batched VAD segments) at the same WER; whole-file WER is much
better than on the Windows CPU run (same whisper.cpp commit, run under
CPU contention); the cause of that difference was not investigated.

### Speaker diarization on AMI (sherpa-onnx CPU, 4 threads)

| Meeting | Live (inc 10/5, join 0.5) DER | Post-merge DER | Windows live / post-merge | Offline threshold 1.2 | Windows offline 1.2 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ES2004a | 25.7% | 24.3% | 26.2% / 24.4% | 32.9% (3 spk) | 21.6% (4 spk) |
| IS1009a | 32.3% | 29.2% | 29.1% / 26.5% | 17.0% (5 spk) | 29.0% (5 spk) |
| TS3003a | 25.5% | 22.9% | 25.3% / 22.7% | 21.8% (6 spk) | 21.1% (6 spk) |

- Live: RTF 0.011--0.012, worst hop 0.1--0.34 s for a 5 s hop, peak 371--459
  MiB.  Live results reproduce Windows within 0.5 points except IS1009a (+3).
- Offline at a fixed threshold swings by 11--12 points per meeting between
  the two onnxruntime builds (ES2004a merges a speaker; IS1009a improves).
  This confirms the narrow threshold band: the final pass should not rely on
  one global threshold.  RTF 0.07, peak 508--582 MiB.

### Summary model (llama.cpp Metal, `-ngl 99`)

Qwen3.5-9B Q4_K_M, same prompt, schema and meetings
(`artifacts/summary-metal/`, judged in `artifacts/summary/judgments.md`).

| Measure | Result |
| --- | ---: |
| Recall (of 50) | **76%** (Windows CUDA 80%, CPU 61%) |
| Valid JSON / evidence timestamps | 3/3 / 67 of 68 |
| Non-items | ~6% |
| Time per meeting (14k--32k prompt tokens) | 72--158 s (450--620 prompt tok/s, 18.7 gen tok/s) |
| Model load | 12 s |
| Peak memory | 2.5 GiB footprint + 5.3 GiB memory-mapped weights, about 7.8 GiB |

Usable after Stop on a 16 GB Mac.  Recall stays within the build-to-build
noise already seen.

### Memory during recording (macOS, measured parts)

| Component | Peak |
| --- | ---: |
| Capture process (two tracks) | 16 MiB |
| Live speech: whisper.cpp small.en (Metal) | 0.65 GiB (turbo live: 0.97 GiB) |
| Live speakers: sherpa-onnx incremental | 371--459 MiB |
| **Measured total** | **about 1.1--1.5 GiB** |

Within the 6 GB budget, as on Windows.

### Device-state cases (macOS, 2026-10-29 evening)

`scripts/run-macos-device-case.sh`: quiet afplay tone plus default mic,
180--240 s, change at 60 s.  Output and mic switches were made at the exact
second by `probes/macos-dual-capture/SetDefaultDevice` (the virtual Steam
Streaming devices as targets); the owner did sleep/wake and the AirPods Pro
3 steps.  Outputs: `artifacts/capture/macos/devices/`.

| Case | Probe | App track | Mic track |
| --- | --- | --- | --- |
| Output switch (speakers to virtual device) | ran to end, exit 0 | tone continuous, 0 gaps | unaffected |
| Mic switch (to virtual mic) | ran to end | tone continuous | **stayed on the old mic** (live, 0 gaps) |
| AirPods connect (become default output and mic) | ran to end | tone continuous | stayed on the built-in mic |
| AirPods disconnect (started on AirPods output and mic) | ran to end | **half rate while on AirPods hands-free** (24 kHz delivered, 48 kHz assumed, no flag); 35 s of silence padded in one step when output fell back to the speakers | **stopped at 70 s: no packets, no error** |
| AirPods enter hands-free mid-run (mic switched to AirPods) | ran to end | tone continuous, full rate | stayed on the built-in mic, 0 gaps |
| Sleep/wake (55 s asleep, Apple menu) | ran to end, exit 0 | resumed with tone | resumed |

Sleep/wake detail: host time (`mach_absolute_time`) does not advance during
sleep, so the probe saw a single 24 s arrival jump (1 discontinuity, nothing
padded) for 55 s of sleep.  Both tracks stayed aligned with each other
(25 ms), but the recording is about 41 s shorter than the wall-clock span
(217 s of audio in 282 s; the probe's own timer also stopped while asleep).

**Design consequences for the Phase 2 macOS adapter:**

1. Listen for default-device changes and reopen the mic on the new default,
   as on Windows; a disappearing device stops delivering without an error, so
   keep an arrival watchdog.
2. Read the tap's actual delivered rate per packet, not once at start: a tap
   whose aggregate device is clocked by a hands-free Bluetooth headset
   delivers half the frames with no flag.  Rebuild the tap aggregate when the
   default output changes.
3. Handle sleep explicitly: close the chunk on the will-sleep notification
   and start a new chunk on wake, stamped with a sleep-aware clock
   (`mach_continuous_time` or wall time); host time alone loses the sleep.
4. These agree with the Windows rules: the per-chunk timestamps and "new
   chunk at every gap" design covers both platforms once wake and device
   changes force a chunk boundary.

### Not run on the Mac yet

- 8 h drift run: started 2026-10-29 19:32 (results to follow).

## Gate Checklist

- [x] Synced dual-track capture works on Windows.  60 min and 8 h pass with
  per-chunk timestamps (8 h: within 2 ms for 99.95% of packets; mic lost
  0.56% to load stalls, app track lost nothing).  Device cases ran: the
  probe never crashed, and the failures (mic does not follow device
  changes, silent stream death, 1.7 s offset after standby) are handled by
  the adapter rules above, not blockers.  USB unplug and mic-privacy cases
  not run.
- [ ] Synced dual-track capture works on Apple Silicon macOS.  Isolation
  passes; 60 min keeps per-chunk sync within 0.03 ms, but CPU-saturating
  load causes 2 audio-engine stalls per hour on both tracks (100--200 ms);
  Metal-worker reruns (with real app audio) show 3--5 stalls per hour not
  caused by the worker.  Device cases ran: the probe never crashed; mic does
  not follow device changes, Bluetooth hands-free halves the app-track rate,
  and sleep is invisible to host time (adapter rules above).  8 h drift run
  in progress.
- [ ] Recording survives a crashed AI worker on both machines.  Windows
  passes (120 runs, 16 killed, 0 app-track gaps).  macOS: recording survives
  every kill (3 x 121 runs, 36 killed, no kill-related gaps); the load stalls
  above are a separate finding.
- [x] Native models fit the 6 GB whole-app recording budget.  Windows about
  1.3 GiB, macOS about 1.1--1.5 GiB measured, before the shell.
- [x] Live diarization is usable, or the documented fallback is accepted.
  Usable at about 25--32% DER on both machines; accepted by the owner
  2026-10-29 (final DER pass line ~25%, 20% kept as a stretch goal).
- [x] The Meetily decision rule has a decisive code-level failure.
- [x] The final framework choice is approved by the project owner:
  Electron with project-owned capture adapters (2026-10-29).

## Gate Decision

**Not ready for approval.** Phase 1 remains blocked by Gate 0.  Remaining:
the Mac 8 h drift run (in progress) and the macOS capture and crash-worker
checklist items it closes.  The owner decided every open item on
2026-10-29 (`HANDOFF-PARALLEL.md`, table B): all recommendations accepted;
final DER pass line ~25% and summary recall pass line ~80%, with 20% and 90%
kept as stretch goals; live-versus-final WER stays at 15%; RAM 16 GB
minimum, 32 GB recommended.

