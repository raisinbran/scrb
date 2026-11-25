# V-b noise filter and echo suppression — decision plan (2026-11-25)

**Proposal only; no implementation or tests authorized.** V13 / Must 11, [issue #487](https://github.com/raisinbran/scrb/issues/487), [V1 path forward §4](../../dev-plan/m1-v1-path-forward-20261123.md). Baseline: main 65e2b328 (Nov 25).

## Goal and preferred approach

Mac B0 Teams with speakers on: remote speech on the mic track was **8 dB louder than local speech** (-26 versus -34 dB), causing about **14 duplicated “You” fragments**. The untouched mic and meeting **originals are non-negotiable**; process only disposable copies for live and final recognition. Discord/Teams are quality benchmarks, not proof of which DSP they use.

**Mac:** Prefer locally bundled **WebRTC Audio Processing Module (APM: AEC3 + NS + digital AGC)** after the raw fork, with the meeting tap as far-end reference. Do **not** default to Apple Voice Processing I/O: an earlier spike reduced echo ≥15 dB but reduced the **meeting tap** ~9 dB; safe physical output and raw-original preservation are not proved. **Windows 11:** Prefer the same APM recognition-copy architecture; enumerate native APO/Voice Focus capability only as a gated alternative, never a prerequisite. **Cross-platform fallback:** SpeexDSP AEC + preprocessor if APM fails resource, fidelity, or packaging checks; benchmark its nonlinear-echo/double-talk limits.

## Options: evidence and redistribution

| Option | Capability, risk, license evidence |
| --- | --- |
| **WebRTC APM** | Real-time AEC3 (requires aligned reverse/far-end stream), noise suppression and gain; native C++ build size/pins. [APM source](https://webrtc.googlesource.com/src/+/refs/heads/main/modules/audio_processing/), [stream/reverse API](https://webrtc.googlesource.com/src/+/refs/heads/main/api/audio/audio_processing.h); upstream [BSD-style LICENSE](https://webrtc.googlesource.com/src/+/refs/heads/main/LICENSE) and PATENTS/third-party notices. **Primary.** |
| **RNNoise** | Lightweight RNN suppressor; **not AEC**. [Code BSD-3-Clause](https://github.com/xiph/rnnoise/blob/main/COPYING); [pretrained model weight licensing question](https://github.com/xiph/rnnoise/issues/284) unresolved. Optional Strong candidate only after separate weight review. |
| **DeepFilterNet** | Larger neural denoiser, not AEC; model footprint/latency risk. [Code and repository models MIT OR Apache-2.0](https://github.com/Rikorose/DeepFilterNet/blob/main/README.md). Defer pending benefit benchmark. |
| **SpeexDSP** | Lightweight AEC, NS and AGC preprocessor; poorer nonlinear-echo performance possible. [BSD-3-Clause](https://github.com/xiph/speexdsp/blob/master/COPYING) and [API](https://github.com/xiph/speexdsp/blob/master/include/speex/speex_preprocess.h). **Fallback.** |
| **macOS Voice Processing I/O** | OS AEC/NS/AGC; can alter incoming mic and duck playback. [API](https://developer.apple.com/documentation/audiotoolbox/audio-unit-voice-i-o), [ducking controls](https://developer.apple.com/documentation/avfaudio/avaudiovoiceprocessingotheraudioduckingconfiguration). Apple system APIs, not a third-party binary to distribute. Feasibility only. |
| **Windows communications / Studio Effects** | Driver/APO or NPU-dependent voice processing may precede capture, contaminating the saved original; [modes](https://learn.microsoft.com/en-us/windows-hardware/drivers/audio/audio-signal-processing-modes), [hardware prerequisites](https://learn.microsoft.com/en-us/windows/apps/develop/windows-integration/studio-effects). OS-provided, device-specific. Feasibility only. |

Pin exact library revisions; audit their transitive licenses, patents, notice obligations and any separately licensed weights **before packaging**. Upstream license claims are not shipping clearance.

## Exact recognition-only insertion points

**Unchanged raw recording:** macOS native/macos-capture/src/Capture.swift (MicStream and MeetingStream) → native/macos-capture/src/main.swift (Track.drain). Its separate writer.write and live_offer consume the same raw samples. Windows native/windows-capture/src/TrackPipeline.cpp writes sink_.Write before LivePcmFeed::Offer (configured in Session.cpp). **Never insert DSP before the chunk writers, in capture rings, or in the meeting-track original.**

**Live:** apps/desktop/src/main/live-feed.ts uses PcmFrameDecoder → LiveAudioWorker.offer → packages/transcription/src/liveAudioWorker.ts / livePcmEngine.ts. Copy *mic* frames **after** this raw/live fork, pair with untouched *meeting* frames as APM reverse reference, convert to 10 ms/rate-correct frames with host-time/delay alignment, and deliver only filtered mic samples to recognition. Bound reference jitter, CPU and queues; reset on pause, format/device switch or helper restart. Missing reference or overload: bypass DSP with a diagnostic, **never block recording**.

**Final:** packages/transcription/src/finalPass.ts calls assembleChunks into temporary WAVs in workDir. Use the unmodified meeting WAV as reference to create a **different temporary filtered mic WAV** before transcribeWholeFile; preserve source chunks and timestamps. Remove scratch through existing workDir cleanup. Retest current dropRoomEcho/LiveEchoFilter safeguards for erroneous suppression of true local speech. Read AudioSettings at start via backend.ts / recording.ts and pin an internal per-meeting settings snapshot for final/retry (storage review if needed). Keep existing experimental SCRB_VOICE_AEC default-off.

## Settings truth (V13)

| Setting | Planned recognition-copy behavior |
| --- | --- |
| **Noise Off / Standard / Strong** | NS disabled / APM moderate / APM aggressive; AEC and AGC remain **independent** of NS Off. Strong must prove no suppression of quiet/distant speech. |
| **Voice Isolation** | Current preset: Strong NS + echo cancellation + AGC on; bypass off. No speaker/output ducking. |
| **Studio** | Current preset: NS/AEC/AGC off, bypass on; raw recognition copy. Disclose that unavoidable OS/driver processing may already be present. |
| **Custom** | Each saved toggle controls the corresponding measurable effect; unsupported native bypass shows an honest unavailable state, not apparent success. |

Input sensitivity, advanced VAD, no-audio warning and device suggestions are separate [V1 input-settings](v1-input-settings-closure.md) work, not silently satisfied here.

## Pass/fail design — targets, not achieved results

Use **public AMI** fixtures and invented deterministic room echoes (40–400 ms), then **owner-approved isolated** Mac and Windows playback of AMI remote speech through speakers plus a second AMI/invented quiet near-end voice. Include far-end-only, near-end-only, double talk, headphones, selected-app versus whole-output tap. Pin speaker level/device/distance and compare same-model WER on unfiltered versus filtered PCM.

- **Recognition:** near-end WER must be **no worse than unfiltered** for quiet/normal near-end-only and double talk (report denominators), with no missing first/last local words.
- **Leakage:** remote-voice energy in mic track reduced **≥12 dB median** in far-end-only windows and **≥8 dB in every measured condition**, time-aligned RMS relative to unfiltered.
- **Timing/integrity:** extra live-copy latency **<30 ms p95**; capture unexplained gaps ≤100 ms and four-hour drift ≤50 ms **only when separately authorized**; offset regression ≤25 ms. Original writer input and stored chunk integrity unchanged; no alteration of meeting track.
- **Ducking:** physical speaker output attenuation **≤0.5 dB**, measured independently of meeting tap. Report CPU/RAM, double-talk loss and failures; safety threshold failure rejects that option. Synthetic PASS is **not** installed V13 acceptance.

## Small independently reviewable implementation slices

1. **V-b0** — 1–2 days, ~250–400 LOC: AMI/bleed metric harness, license/pin decision, raw-data invariants.
2. **V-b1** — 3–5 days, ~500–900 LOC: cross-platform APM wrapper and final-pass scratch mic filtering; synthetic WER/AEC/double-talk tests.
3. **V-b2** — 2–4 days, ~350–650 LOC: live reference alignment/bounded bypass, mode mapping, failure and keyboard/status tests.
4. **V-b3** — 1–2 days/platform, ~150–300 LOC tests/docs: isolated physical bleed/volume and V13/Gate 8 evidence; SpeexDSP only if primary rejected.

**Approval gates:** independently review this high-risk design and obtain **explicit owner approval before native/audio implementation and physical tests**. Later slices require exact-head automated checks, then independent formal review, then owner-only merge approval; no automatic long tests (>20 min). Any packages/contracts edit needs a separate **owner decision plus a new packages/contracts/APPROVALS.md row in the same PR**. This docs-only plan changes no contract, runtime, acceptance status or private recording.
