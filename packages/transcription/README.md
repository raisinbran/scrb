# @scrb/transcription

Transcription backend for Meeting Scribe: audio file import, the final pass
(words, timing, speakers), a bounded live pass that reads saved chunks, and
voice-profile matching.  Input and output use this package's own narrow types
(`src/types.ts`), to be mapped to the shared contract later.

All model and decoder work runs in child processes (`src/worker.ts`) that can be
killed at any moment.  This package holds no capture code and shares no process
with recording.

## Setup

```bash
npm install
npm run build:ffmpeg
SHERPA_ONNX_DIR=/path/to/sherpa-onnx/install npm run build:sidecar
npm test
```

Tools are found through `toolsIn(dir, overrides)`.  `npm test` needs `.bin/ffmpeg`
and `.bin/ffprobe`; set `SCRB_VIDEO_FIXTURE` to any small MP4 to run the video
rejection test.  Decoder license: see `THIRD_PARTY_NOTICES.md`.

## What is here

| Module | Job |
| --- | --- |
| `importFile.ts` | WAV, MP3, M4A, FLAC, Opus to 5 s mono 32 kbps Opus chunks and a 16 kHz WAV; progress, cancel, plain-language failures.  Builds in a hidden sibling folder and renames last, so failure leaves nothing.  Refuses to start during a recording and stops if one begins |
| `finalPass.ts` | Silero VAD, large-v3-turbo-q5_0, `-mc 0`, then offline diarization relabel; one model at a time |
| `livePass.ts` | Bounded per-track queue over saved chunks; skips and reports when behind; restarts whisper-server up to 3 times, then stops without touching the caller |
| `speakers.ts` | Live clustering (join 0.5, "Speaker ?" until 30 s) and the final relabel |
| `profiles.ts` | Voice matching: auto at 0.60, suggest from 0.45, no auto-naming from under 8 segments, one profile per speaker per meeting, no changes when building is off |
| `native/scrb-sherpa.cpp` | sherpa-onnx worker; exits when its stdin closes |

## AMI results

Apple M5, Metal whisper, sherpa on CPU with 4 threads, background priority,
during the 8-hour capture test.  Scored with `phase0/scripts/score_ami_wer.py`
and `score_der.py`; reproduce with `scripts/e2e-ami.ts`.

AMI_RESULTS_PLACEHOLDER
