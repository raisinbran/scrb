# Phase 0 Manifest: what is not in git

GitHub limits files to 100 MB, so these Phase 0 inputs live outside the
repository.  `scripts/fetch-phase0-deps.sh` re-creates all of them at the exact
versions used and checks every file's SHA-256.

## Upstream sources (pinned commits)

| Folder | Repository | Commit | License |
| --- | --- | --- | --- |
| `upstream/whisper.cpp` | ggml-org/whisper.cpp | `284029c07012d2000941a08d38a31ffb71f4734e` (1.9.5-dev) | MIT |
| `upstream/llama.cpp` | ggml-org/llama.cpp | `369dcf309c8b274370e692ac2d42d9708597ae04` | MIT |
| `upstream/opus` | xiph/opus | `251d657e92fccfa3b05baec4f05756cce252fb75` | BSD-3-Clause |
| `upstream/sherpa-onnx` | k2-fsa/sherpa-onnx | `af2d8d81dbfa61c4cea4c568da78f3982edca005` (v2.0.1) | Apache-2.0 |
| `upstream/meetily` | Zackriya-Solutions/meetily | `a2cb62e827da7ef59f65064c97233efb2313878e` | MIT |
| `upstream/windows-classic-samples` | microsoft/Windows-classic-samples | `434f6002bdf9cf9829406c3ff2b33387982d6168` | Microsoft sample license |
| `upstream/meeting-transcriber` | pasrom/meeting-transcriber (macOS capture borrow candidate; reviewed, unused) | `0c40928d44f4453dd0e375db6cff538a8de24065` | MIT |

`patches/windows-application-loopback-duration.patch` applies to the
ApplicationLoopback sample (adds a duration argument).

## Models

| File | Source | SHA-256 | License |
| --- | --- | --- | --- |
| `models/whisper/ggml-small.en-q5_1.bin` | huggingface ggerganov/whisper.cpp | `bfdff489...e478ad30` | MIT |
| `models/whisper/ggml-large-v3-turbo-q5_0.bin` | huggingface ggerganov/whisper.cpp | `39422170...55ffa7e2` | MIT |
| `models/whisper/ggml-silero-v6.2.0.bin` | huggingface ggml-org/whisper-vad @ `9ffd54a1` | `2aa269b7...c9f7fb6987` | MIT |
| `models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/` | k2-fsa release speaker-segmentation-models | tarball `24615ee8...e4996488` | MIT (pyannote) |
| `models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx` | k2-fsa release speaker-recongition-models | `1a331345...3c7a5e4b` | Apache-2.0 |
| `models/sherpa-onnx/wespeaker_en_voxceleb_resnet34_LM.onnx` | k2-fsa release speaker-recongition-models | `e9848563...d9c39012` | Apache-2.0 |
| `models/llm/Qwen3.5-9B-Q4_K_M.gguf` | huggingface unsloth/Qwen3.5-9B-GGUF @ `3885219b` | `03b74727...52b7e8` | Apache-2.0 |
| `models/llm/granite-4.2-8b-Q4_K_M.gguf` | huggingface ibm-granite/granite-4.2-8b-GGUF @ `93f3f6a8` | `16a9369d...aab311` | Apache-2.0 |
| `models/llm/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf` | huggingface mistralai/Ministral-3-8B-Instruct-2512-GGUF @ `0102285a` | `33e7a72c...fdca761` | Apache-2.0 |

Full hashes are in the fetch script.

## Tools and fixtures

- `tools/sherpa-onnx/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts`:
  official v2.0.1 Windows release (Windows only).  The probes link against its
  C API.  On macOS, build sherpa-onnx from `upstream/sherpa-onnx` or use the
  macOS release of the same version.
- `downloads/ami/`: AMI Meeting Corpus (CC BY 4.0) ES2004a, IS1009a and TS3003a
  Mix-Headset audio, plus `ami_public_manual_1.6.2.zip` unpacked to
  `downloads/ami/ann/`.

## Build outputs and large captures (not reproduced)

Executables are rebuilt from `probes/*/build.cmd` (Windows, MSVC at
`C:\BuildTools`) or the macOS probe README.  The large capture WAVs from the
60-minute and 8-hour runs are not kept.  Their `-summary.json` and
`-timing.csv` files, which carry the measurements, are in
`artifacts/capture/dualprobe/`.

Toolchain used on the Windows machine: MSVC v143 (C:\BuildTools), Windows SDK
10.0.26100.0, CMake 3.31.6, Ninja 1.12.1, Python 3.15.1, Git Bash.  No GPU
SDK (CUDA/Vulkan) was installed, so every model number is CPU-only.
