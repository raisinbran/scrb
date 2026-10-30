# Third-party notices for packages/transcription

None of the binaries or models below are committed.  Installer packaging
(Phase 8) must carry these notices and the license texts.

## Audio decoder: FFmpeg 9.0 (LGPL-2.1-or-later)

**Decision.** Import decodes with a minimal FFmpeg built by
`scripts/build-ffmpeg.sh`, run as a separate process.

- Source: <https://ffmpeg.org/releases/ffmpeg-9.0.tar.xz>, SHA-256
  `7f607a00dd0d28a729d5a4811205812eef01cf6ef6155025febb6f36a9062d52` (checked by
  the script; the same bytes ship inside the libav.js 6.10.9 npm package).
- License: LGPL-2.1-or-later.  The build uses neither `--enable-gpl` nor
  `--enable-nonfree`, and the script refuses to finish if either got switched
  on.  `./configure` reports "License: LGPL version 2.1 or later".
- Enabled: only the demuxers, decoders, parsers and filters for WAV, MP3, M4A
  (AAC, ALAC), FLAC and Ogg Opus, the libopus encoder, PCM output, and the file
  and pipe protocols.  No network.  Fewer parsers also means less exposure to
  hostile files.
- Why a separate process satisfies the LGPL: the app does not link FFmpeg; it
  runs an unmodified, replaceable executable found through a configurable path.
  The app must ship the LGPL text, say FFmpeg is used, give the source offer
  (the tarball, build script and configure line), and let the user swap the
  binary.  The script's static link of libopus into the FFmpeg executable is
  fine because libopus is BSD.

**Alternatives checked (2026-10-30).**

| Option | Result |
| --- | --- |
| `ffmpeg-static` npm | Ships GPL builds; rejected |
| libav.js (wasm, LGPL) | Prebuilt variants cover MP3, FLAC, Opus but not AAC (`aac` variants are not published); would need an Emscripten build |
| `@ffmpeg/ffmpeg` wasm | Core is a GPL build; rejected |
| Electron's bundled ffmpeg through WebAudio | Decodes the whole file into memory; unusable for 8-hour files and tied to a renderer |
| `afconvert` / Media Foundation | Platform-specific: two code paths to build and test |

**Windows binary (open).** `scripts/build-ffmpeg.sh` is macOS and Linux only.
The same configure line needs running under MSYS2, or a published LGPL Windows
build (for example BtbN's `win64-lgpl`) can be used at the cost of a much larger
parser surface.  Not done or tested tonight.

**Patents (owner decision).** Software copyright licensing does not settle
patents.  MP3 patents have expired.  AAC decoding is covered by a patent pool
(Via LA), and FFmpeg's license grants no patent rights.  Windows and macOS each
carry their own AAC licenses, which an FFmpeg build does not inherit; Electron's
own FFmpeg carries the same exposure for AAC.  For a personal app this is a low
concern, but it should be a decision rather than an accident.  If it matters, M4A
can go through Media Foundation and Core Audio behind the same interface.

## libopus 1.6.1 (BSD-3-Clause)

Statically linked into the FFmpeg executable.  Source:
<https://downloads.xiph.org/releases/opus/opus-1.6.1.tar.gz>.

## whisper.cpp (MIT)

`whisper-cli`, `whisper-server` and `whisper-vad-speech-segments`, commit
`284029c07012d2000941a08d38a31ffb71f4734e` (1.9.5-dev), run as separate
processes.  Models: `ggml-large-v3-turbo-q5_0`, `ggml-small.en-q5_1` and
`ggml-silero-v6.2.0`.

## sherpa-onnx v2.0.1 (Apache-2.0) and onnxruntime (MIT)

`native/scrb-sherpa.cpp` links the C API, commit
`af2d8d81dbfa61c4cea4c568da78f3982edca005`.  It reuses the structure of the
project's own Phase 0 probe.  Models: pyannote segmentation 3.0 int8 (MIT) and
3D-Speaker ERes2Net (Apache-2.0; check the model card before shipping).

## Test fixtures

`test/fixtures/` is derived from the 11-second `jfk.wav` / `jfk.mp3` samples in
whisper.cpp (MIT repository; a US president's public-domain speech).
