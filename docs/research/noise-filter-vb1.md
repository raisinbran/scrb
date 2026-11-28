# V-b1: recognition-copy noise and echo filter, synthetic results (2026-11-27)

Slice V-b1 of [the V-b plan](../plans/noise-filter-plan-20261125.md), using the [V-b0 harness](noise-bleed-harness.md). **Synthetic only. Not installed V13 acceptance.** No speakers, no live path, no contract change, no owner audio.

## What was built

- `native/apm-filter/`: `scrb-apm-filter`, a small C++ program linking the pinned WebRTC audio processing module (`846fe90a`, v2.1, built with Meson; Windows MSVC build verified, macOS build not tried). It reads the mic WAV and the meeting WAV read-only and writes a **new** file; it refuses an existing output or an output that is an input.
- `packages/transcription/src/noiseFilter.ts`: `filterMicCopy`. Hashes both originals before and after (a change throws `OriginalModifiedError`), writes only `mic-filtered.wav` in the pass's work directory, and returns `bypassed` (caller keeps the unfiltered mic) when the filter is disabled, the helper or reference is missing, the helper fails, the output length is wrong, or audible input comes back silent.
- `finalPass.ts`: optional `noiseFilter` option, **off by default**. Recognition reads the scratch copy of the mic; the echo-envelope check still reads the saved mic; scratch goes with the existing work-directory cleanup. Nothing calls it yet (settings mapping and live path are V-b2).
- The AEC3 adaptive filter is set to 600 ms by default. The built-in 52 ms filter cut only 1-3 dB of the invented 120-400 ms echoes (those spread over 60-200 ms), and a sweep showed filter length was the cause.

## Results against the plan's targets

Echoes: V-b0 `roomEcho` at 40, 120, 250, 400 ms. Settings: noise suppression moderate, echo cancellation on, gain off. The 600 ms tail was chosen while looking at the first clip, so the other two clips are the fair test.

| Target                                                | Measured                                                                                                                                                   | Verdict                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Leakage: median >= 12 dB over far-end-only windows    | held-out clips (2 clips x 4 delays): median of condition medians 49.7 dB; tuned clip medians 11.4-44.7 dB                                                  | met on held-out          |
| Leakage: >= 8 dB in every measured condition (pooled) | 11 of 12 conditions at 9.0-45.6 dB; **tuned clip at 400 ms: 6.7 dB** (held-out minimum 14.9 dB)                                                            | **FAIL** (one condition) |
| Near-end WER no worse than unfiltered                 | near-end-only normal 14.3% -> 18.2%; quiet 15.6% -> 18.2%; double talk 120 ms 82.5% -> 58.4%; double talk 400 ms 79.9% -> 98.1% (154 reference words each) | **FAIL** in 3 of 4       |
| No missing first/last local words                     | first and last 3 words found, of 12: unfiltered 8/8/3/4, filtered 6/7/5/3                                                                                  | not met in 3 of 4        |
| Live-copy latency < 30 ms p95                         | not measured (offline processing only; V-b2)                                                                                                               | NOT_VERIFIED             |
| Originals unchanged, meeting track untouched          | byte hashes equal before and after in unit tests, the final-pass test and every synthetic run                                                              | met                      |
| Ducking <= 0.5 dB, CPU/RAM, four-hour drift           | not measured                                                                                                                                               | NOT_VERIFIED             |

Ablation (same conditions, leakage skipped): echo cancellation alone raised near-end-only WER to 20.8% and 18.8%; noise suppression alone to 18.2% and 18.2%. So neither stage alone explains the regression.

## What this does and does not show

- Denominators are small (154 words, two 30 s windows of one AMI speaker; the two others in each window add a few words to both transcripts equally). A 6-error difference is not a significance test. One recognizer model (small.en q5_1), one run per condition.
- Near-end audio is an AMI headset mix, not a separate close microphone; double-talk WER is very high for both copies by design (near end 8 dB under the echo).
- The filter makes near-end-only speech slightly worse here. Before enabling it by default the plan's gate needs a fix or a decision (for example moderate versus off, different tail length, or filtering only when the echo checks find echo). That is not decided here.
- macOS build, packaging, the neural weights inside APM's voice-activity code, and legal review of the notices are open; see `third_party/THIRD_PARTY_NOTICES.md`.

Reproduce: `native/apm-filter/build.cmd` (needs Visual C++ Build Tools and Meson), `scripts/dev-assets.sh ami` and `asr`, a pinned whisper.cpp build, then `npx tsx scripts/research/noise-filter-synthetic.mts <assets> <helper exe> <out.json>`. Optional `SCRB_VB1_MODE=aec-only|ns-only`.
