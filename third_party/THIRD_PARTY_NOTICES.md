# Phase 0 Third-Party Sources

These sources are used only for throwaway feasibility work.  Any code later
adapted into Meeting Scribe must be reviewed and recorded again in the
production repository.

## Meetily

- Repository: https://github.com/Zackriya-Solutions/meetily
- Commit: `a2cb62e827da7ef59f65064c97233efb2313878e`
- Source path: complete repository under `upstream/meetily/`
- License: MIT
- Copyright: Copyright (c) 2024 Zackriya Solutions
- Local changes: none

## Microsoft Application Loopback Sample

- Repository: https://github.com/microsoft/Windows-classic-samples
- Commit: `434f6002bdf9cf9829406c3ff2b33387982d6168`
- Source path: `Samples/ApplicationLoopback/`
- Files used: official sample source and build files under
  `upstream/windows-classic-samples/Samples/ApplicationLoopback/`
- License: Microsoft sample license in the upstream repository
- Local changes: the Phase 0 executable accepts an optional capture duration
  argument instead of being fixed to 10 seconds; capture implementation is
  otherwise unchanged

## Microsoft WASAPI Capture Shared Event Driven Sample

- Repository: https://github.com/microsoft/Windows-classic-samples
- Commit: `434f6002bdf9cf9829406c3ff2b33387982d6168`
- Source path:
  `Samples/Win7Samples/multimedia/audio/CaptureSharedEventDriven/`
- Files used: official sample source, built locally without source changes
- License: Microsoft sample license in the upstream repository
- Local changes: none

## whisper.cpp

- Repository: https://github.com/ggml-org/whisper.cpp
- Commit: `284029c07012d2000941a08d38a31ffb71f4734e`
- Version: `1.9.5-dev`
- Source path: complete repository under `upstream/whisper.cpp/`
- License: MIT
- Models used: `ggml-small.en-q5_1.bin` and
  `ggml-large-v3-turbo-q5_0.bin` from the upstream model download endpoint
- Local changes: none; a CPU-only out-of-tree build was generated

## sherpa-onnx

- Repository: https://github.com/k2-fsa/sherpa-onnx
- Commit: `af2d8d81dbfa61c4cea4c568da78f3982edca005`
- Version: `v2.0.1`
- Source path: complete repository under `upstream/sherpa-onnx/`
- License: Apache-2.0
- Binary used: official Windows x64 shared MD release without TTS
- Models used: int8 Pyannote 3.0 segmentation and 3D-Speaker ERes2Net
  embedding models from the sherpa-onnx model distribution
- Local changes: none

