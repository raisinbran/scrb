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

**Final pass, imported WAV** (decoded straight from the source file):

| Meeting | Length | WER | Phase 0 WER | DER | Speakers (true 4) | Miss | Confusion |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ES2004a | 17.5 min | **23.8%** | 23.8% | **20.3%** | 4 | 17.2% | 2.2% |
| IS1009a | 14.0 min | 23.4% | n/a | 15.4% | 4 | n/a | n/a |
| TS3003a | 25.1 min | 19.3% | n/a | 20.6% | 2 | n/a | n/a |
| IS1009b (hold-out) | 34.2 min | 17.6% | n/a | 8.6% | 4 | 6.3% | 1.7% |
| TS3003b (hold-out) | 36.8 min | 17.5% | n/a | 8.4% | 4 | 5.2% | 0.6% |

ES2004a matches the Phase 0 WER exactly, and DER beats the Phase 0 offline range
of 22--33%.  The improvement comes from the relabel below, not from the models.
The first three DER rows were scored from cached embeddings with the final rule;
their full end-to-end runs used an earlier rule.  The hold-out rows are full runs
of the final code, on meetings not used to choose the rule, though these people
also appear in the tuning meetings.  Speaker miss is mostly overlapped speech,
which this pipeline never assigns.

**Final pass from saved Opus chunks** (the path a recording takes):

| Meeting | WER | DER | Speakers |
| --- | ---: | ---: | ---: |
| ES2004a | 26.9% | 21.1% | 4 |
| IS1009a | 23.0% | 16.5% | 4 |
| TS3003a | 20.3% | 21.5% | 2 |

Opus costs about 1 point of DER everywhere.  ES2004a loses 3 points of WER and
the other two lose under 1, so the WER cost varies and is not fully understood.

**Relabel rule.**  Sherpa runs at an over-splitting threshold (1.0), clusters
under 30 s are absorbed, and the rest merge at cosine 0.65.  Results are identical
across 0.60--0.70 on all six inputs above; below 0.60 meetings start losing
speakers.  This is a voice-similarity line on a wide plateau, unlike sherpa's
narrow threshold.  A known speaker count is not safer: on TS3003a chunks it gave
47% DER, because small clusters get promoted to speakers.

**Live pass** (full-speed replay of saved chunks, turbo on Metal):

| Meeting | WER | DER | Post-merge DER | Phase 0 live / post-merge DER | Chunk time p50 / p95 / max | Relabels |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ES2004a | 30.8% | 26.3% | 23.9% | 25.7 / 24.3% | 0.6 / 1.1 / 3.0 s | 13 |
| IS1009a | 27.1% | 33.0% | 28.8% | 32.3 / 29.2% | 0.6 / 1.1 / 1.6 s | 16 |
| TS3003a | 27.3% | 26.5% | 23.3% | 25.5 / 22.9% | 0.6 / 1.4 / 1.9 s | 24 |

Live speaker results reproduce Phase 0 within a point.  Each 5 s chunk finishes
well inside 5 s, so the pass keeps up.  Live WER is worse than Phase 0's per-segment
24%: audio here is cut at chunk and VAD edges and comes through Opus.

## Known limits

- **Live delay floor.**  Text cannot appear until its chunk is saved, so with 5 s
  chunks speech can wait up to 5 s plus about 1 s of processing.  The "about 3
  seconds" requirement is not met this way.
- **Long meetings are unmeasured.**  The longest run is 37 min.  Diarization took
  0.16--0.35x meeting length under load and holds the whole file in memory, so an
  8-hour run may need 1--3 hours and well over 2 GB.  Check before Gate 3.
- **Thin evidence.**  Five meetings from three AMI series, headset mixes only.
- **Corrected-word freezing is not here.**  The final pass returns model text; the
  transcript layers must apply frozen spans.
- **An orphaned whisper-server.**  If the app itself crashes, `whisper-server`
  keeps running; `scrb-sherpa` exits on stdin EOF but whisper-server does not.
- **Not run:** Windows, CPU-only machines, killing a real live whisper-server
  (restart is tested with a fake), and vocabulary hints on real audio.
- **Recording chunks must not lose samples.**  An Ogg Opus file with the usual
  pre-skip drops 6.5 ms when decoded alone.  Import clears it from all chunks but
  the first (`src/ogg.ts`), and assembly places chunks by stamp, so drift cannot
  build; but a chunk writer that resets per chunk needs to handle this too.
