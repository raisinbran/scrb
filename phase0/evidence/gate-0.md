# Gate 0 Evidence

Status: **In progress; Apple Silicon execution still required**

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

Started 2026-10-28 17:12 against a silent target, ends ~01:12.  Results are
recorded below when complete.

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

## Recommendations for Gate 0 open items (proposed; owner decides)

| Open item | Proposal from measurements |
| --- | --- |
| Desktop shell | Electron (Meetily fails rule 1 at the capture architecture) |
| Live / final speech models | GPU machines: large-v3-turbo-q5_0 live and final, per VAD segment; CPU-only: small.en-q5_1 live with `-ac 768`, turbo final; `-mc 0` for whole-file passes |
| Live diarization | Incremental per-segment clustering (join 0.5) with the "Speaker ?" rule; offline relabel in the final pass |
| Summary model | Qwen3.5-9B Q4_K_M (80% recall on GPU, stable JSON, lowest memory); Ministral was best on CPU (84%) but loops on the newer llama.cpp build |
| Audio chunks | 5 s Opus chunks, mono 32 kbps per track, each stamped with its first frame's device timestamp (QPC / host time) |
| Voice-match confidence line | Not measured; needs labeled multi-meeting voice data (Phase 4) |
| DOCX library | Follows Electron: a Node DOCX writer such as `docx` (to be pinned in Phase 7) |
| Targets to revisit | Final DER 20% (best measured 21--28%); summary recall 90% (best 80--84% on reference text); live-versus-final WER 15% (about 10% at GPU full context); RAM guidance now 32 GB typical |

## Apple Silicon Machine

Pending access and execution.  `probes/macos-dual-capture/` holds an untested
Swift probe (Core Audio process tap over the target's process tree, plus the
default input device), with outputs compatible with the Windows analysis
scripts.  Required: isolation, 60-minute worker-kill stress, the 8 h drift run,
device cases, and Metal builds of whisper.cpp, sherpa-onnx and llama.cpp for
the model memory and timing runs.

## Gate Checklist

- [ ] Synced dual-track capture works on Windows.  60 min passes with
  per-chunk timestamps; 8 h run pending; device-change, sleep/wake and
  Bluetooth cases not run.
- [ ] Synced dual-track capture works on Apple Silicon macOS.
- [ ] Recording survives a crashed AI worker on both machines.  Windows
  passes (120 runs, 16 killed, 0 app-track gaps); macOS not run.
- [ ] Native models fit the 6 GB whole-app recording budget.  Windows passes
  at about 1.3 GiB measured, before the shell; macOS not run.
- [ ] Live diarization is usable, or the documented fallback is accepted.
  Usable on Windows at about 25--29% DER, pending owner acceptance.
- [x] The Meetily decision rule has a decisive code-level failure.
- [ ] The final framework choice is approved by the project owner.

## Gate Decision

**Not ready for approval.** Phase 1 remains blocked by Gate 0.  Remaining:
the 8 h Windows drift result, the Windows device-state cases, the whole Apple
Silicon run, GPU confirmation of the delay and final-pass-time targets, and
owner decisions on the framework, the DER and summary-recall targets, and the
recommendations above.

