#!/usr/bin/env bash
# Creates the development assets that are too large for git: pinned upstream
# clones, models, AMI audio, the CMake/Ninja tools and, on macOS, the
# whisper.cpp, llama.cpp and sherpa-onnx builds. Every download is checked against its
# SHA-256. Versions and licenses are listed in phase0/MANIFEST.md.
#
# Usage (Terminal on macOS, Git Bash on Windows):
#   scripts/dev-assets.sh [all|upstream|asr|diarization|ami|ami-series|summary|tools|build]
# Default is all. Files already present with the right hash are skipped.
# The summary group is ~16 GB; everything else is ~2 GB.
#
# SCRB_DEV_ASSETS is the destination (default ~/scrb-dev-assets).
# SCRB_DEV_ASSETS_SEED names an existing folder with the same layout, such as an
# old phase0/. Files are copied from it instead of downloaded, but are still
# hash-checked. Build folders are never copied: their library paths point at the
# seed, so the build group rebuilds them in place.

set -euo pipefail
root="${SCRB_DEV_ASSETS:-$HOME/scrb-dev-assets}"
seed="${SCRB_DEV_ASSETS_SEED:-}"
abs_path() {  # absolute path, resolved through the nearest folder that exists
  local p="$1" rest=""
  while [[ ! -d "$p" ]]; do
    # A ".." under a folder that does not exist yet cannot be resolved here.
    [[ "$(basename "$p")" == .. ]] && { echo "path has an unresolved ..: $1" >&2; exit 1; }
    rest="/$(basename "$p")$rest"; p="$(dirname "$p")"
  done
  echo "$(cd "$p" && pwd -P)$rest"
}
if [[ -n "$seed" ]]; then
  [[ -d "$seed" ]] || { echo "SCRB_DEV_ASSETS_SEED is not a folder: $seed" >&2; exit 1; }
  seed="$(abs_path "$seed")"
  # The seed may be Gate 0 evidence, and files under the destination get replaced.
  dest="$(abs_path "$root")"
  if [[ "$dest" == "$seed" || "$dest" == "$seed"/* || "$seed" == "$dest"/* ]]; then
    echo "SCRB_DEV_ASSETS and SCRB_DEV_ASSETS_SEED must not overlap" >&2; exit 1
  fi
fi
mkdir -p "$root"
cd "$root"
group="${1:-all}"

# APFS clones (cp -c) cost no disk space; elsewhere this is a plain copy.
clone_flag=
touch .copy-probe
if cp -c .copy-probe .copy-probe-2 2>/dev/null; then clone_flag=-c; fi
rm -f .copy-probe .copy-probe-2
copy() { cp $clone_flag "$@"; }

sha256() {
  if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1
  else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

fetch() {  # fetch <dest> <sha256> <url>
  local dest="$1" sum="$2" url="$3"
  if [[ -f "$dest" && "$(sha256 "$dest")" == "$sum" ]]; then echo "ok   $dest"; return; fi
  rm -f "$dest"
  mkdir -p "$(dirname "$dest")"
  if [[ -n "$seed" && -f "$seed/$dest" ]]; then
    echo "copy $dest"
    copy "$seed/$dest" "$dest.part"
    if [[ "$(sha256 "$dest.part")" == "$sum" ]]; then mv "$dest.part" "$dest"; return; fi
    echo "seed copy of $dest has the wrong hash; downloading" >&2
    rm -f "$dest.part"
  fi
  echo "get  $dest"
  curl -sSfL -o "$dest.part" "$url"
  local got; got="$(sha256 "$dest.part")"
  if [[ "$got" != "$sum" ]]; then
    echo "SHA-256 mismatch for $dest: $got" >&2; rm -f "$dest.part"; exit 1
  fi
  mv "$dest.part" "$dest"
}

clone() {  # clone <dir> <url> <commit>
  local dir="$1" url="$2" commit="$3"
  if [[ -d "$dir/.git" && "$(git -C "$dir" rev-parse HEAD)" == "$commit" ]]; then echo "ok   $dir"; return; fi
  rm -rf "$dir"
  if [[ -n "$seed" && -d "$seed/$dir/.git" && "$(git -C "$seed/$dir" rev-parse HEAD)" == "$commit" ]]; then
    echo "copy $dir @ $commit"
    mkdir -p "$(dirname "$dir")"
    copy -R "$seed/$dir" "$dir"
    rm -rf "$dir/build"
    return
  fi
  echo "get  $dir @ $commit"
  git init -q "$dir"
  git -C "$dir" remote add origin "$url"
  git -C "$dir" fetch -q --depth 1 origin "$commit"
  git -C "$dir" checkout -q FETCH_HEAD
}

HF=https://huggingface.co
SO=https://github.com/k2-fsa/sherpa-onnx/releases/download
AMI=https://groups.inf.ed.ac.uk/ami

if [[ "$group" == all || "$group" == upstream ]]; then
  clone upstream/whisper.cpp https://github.com/ggml-org/whisper.cpp 284029c07012d2000941a08d38a31ffb71f4734e
  clone upstream/llama.cpp https://github.com/ggml-org/llama.cpp 369dcf309c8b274370e692ac2d42d9708597ae04
  clone upstream/opus https://github.com/xiph/opus 251d657e92fccfa3b05baec4f05756cce252fb75
  clone upstream/sherpa-onnx https://github.com/k2-fsa/sherpa-onnx af2d8d81dbfa61c4cea4c568da78f3982edca005
  clone upstream/meetily https://github.com/Zackriya-Solutions/meetily a2cb62e827da7ef59f65064c97233efb2313878e
  clone upstream/windows-classic-samples https://github.com/microsoft/Windows-classic-samples 434f6002bdf9cf9829406c3ff2b33387982d6168
  # macOS capture borrow candidate named in the plan (reviewed by Codex, not yet used).
  clone upstream/meeting-transcriber https://github.com/pasrom/meeting-transcriber 0c40928d44f4453dd0e375db6cff538a8de24065
fi

if [[ "$group" == all || "$group" == asr ]]; then
  fetch models/whisper/ggml-small.en-q5_1.bin bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30 \
    $HF/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin
  fetch models/whisper/ggml-large-v3-turbo-q5_0.bin 394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2 \
    $HF/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
  fetch models/whisper/ggml-silero-v6.2.0.bin 2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987 \
    $HF/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin
fi

if [[ "$group" == all || "$group" == diarization ]]; then
  fetch models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488 \
    $SO/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2
  tar -xjf models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 -C models/sherpa-onnx
  fetch models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx 1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b \
    $SO/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx
  fetch models/sherpa-onnx/wespeaker_en_voxceleb_resnet34_LM.onnx e9848563da86f263117134dfd7ad63c92355b37de492b55e325400c9d9c39012 \
    $SO/speaker-recongition-models/wespeaker_en_voxceleb_resnet34_LM.onnx
  fetch models/sherpa-onnx/0-four-speakers-zh.wav bedf036caed208386c67b4ef4b11f83d74dd0d420b102163a1c33cd09cde7010 \
    $SO/speaker-segmentation-models/0-four-speakers-zh.wav
  if [[ "$(uname -s)" == MINGW* || "$(uname -s)" == MSYS* ]]; then
    fetch tools/sherpa-onnx/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts.tar.bz2 11fd6a50b97eed38b54fb16d8219f49b16aa7f6a8e43a042316469ef47652e82 \
      $SO/v2.0.1/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts.tar.bz2
    tar -xjf tools/sherpa-onnx/sherpa-onnx-v2.0.1-win-x64-shared-MD-Release-no-tts.tar.bz2 -C tools/sherpa-onnx
  fi
fi

if [[ "$group" == all || "$group" == ami ]]; then
  fetch downloads/ami/ES2004a.Mix-Headset.wav 3e2560b19bee6952c7c7ce041b0f1ea8a7ea9468044c4eea79d2a2c67e24ab0f \
    $AMI/AMICorpusMirror/amicorpus/ES2004a/audio/ES2004a.Mix-Headset.wav
  fetch downloads/ami/IS1009a.Mix-Headset.wav 6eb5a0ede0d9e72794f976ce7bea5b78133eae969f99b4c5418b43c2468d25b1 \
    $AMI/AMICorpusMirror/amicorpus/IS1009a/audio/IS1009a.Mix-Headset.wav
  fetch downloads/ami/TS3003a.Mix-Headset.wav b6ce59ff735c234afdd94b13744aa26f6785af746170543fd03b33160e920a6d \
    $AMI/AMICorpusMirror/amicorpus/TS3003a/audio/TS3003a.Mix-Headset.wav
  fetch downloads/ami/ami_public_manual_1.6.2.zip b56e5babb2496b8795deeeda7e71178d7fbc9963f94276cf2a3f4b56ebbc9f9d \
    $AMI/AMICorpusAnnotations/ami_public_manual_1.6.2.zip
  mkdir -p downloads/ami/ann && unzip -q -o downloads/ami/ami_public_manual_1.6.2.zip -d downloads/ami/ann
fi

# Later meetings of the same series, for the cross-session voice-match line
# (scripts/voice_match_cross.py).  Not part of "all" (~620 MB).
if [[ "$group" == ami-series ]]; then
  fetch downloads/ami/ES2004b.Mix-Headset.wav ad0cf07c42b1694ccf7bea8f1a37348d9cfab194787abc7d050b29ba56e365c8 \
    $AMI/AMICorpusMirror/amicorpus/ES2004b/audio/ES2004b.Mix-Headset.wav
  fetch downloads/ami/ES2004c.Mix-Headset.wav 47dc9bd2e3b1d174842091ae9e1fe765218f0c87658b17d6469c404e03ec2ac5 \
    $AMI/AMICorpusMirror/amicorpus/ES2004c/audio/ES2004c.Mix-Headset.wav
  fetch downloads/ami/ES2004d.Mix-Headset.wav 3cfce3297ebb7faeb53c02727eea5e9f2c76e9ed4b62db3b03d73e66836e91f3 \
    $AMI/AMICorpusMirror/amicorpus/ES2004d/audio/ES2004d.Mix-Headset.wav
  fetch downloads/ami/IS1009b.Mix-Headset.wav 07c2891ae6ad7c507b2a4f15b2dcd0a2343491df9e4e6a58f9db0d0b2c5e1382 \
    $AMI/AMICorpusMirror/amicorpus/IS1009b/audio/IS1009b.Mix-Headset.wav
  fetch downloads/ami/IS1009c.Mix-Headset.wav f317910070db0f2649315decbb34686d648bbe9dc3f7576710184f4d572bdbcc \
    $AMI/AMICorpusMirror/amicorpus/IS1009c/audio/IS1009c.Mix-Headset.wav
  fetch downloads/ami/IS1009d.Mix-Headset.wav 470440114ee2ed076cfc77c53136ad5d3af500d8a5a6ca36755e83534f5ca4ea \
    $AMI/AMICorpusMirror/amicorpus/IS1009d/audio/IS1009d.Mix-Headset.wav
  fetch downloads/ami/TS3003b.Mix-Headset.wav 0c94f3a09ab747caa7714efe8852f5ff37d36cf272b75709344991df1aa266ca \
    $AMI/AMICorpusMirror/amicorpus/TS3003b/audio/TS3003b.Mix-Headset.wav
  fetch downloads/ami/TS3003c.Mix-Headset.wav b9f455870e8cb0ba765523a1767cc366775ab7e5e3eabf37d9c91289e5a1a70a \
    $AMI/AMICorpusMirror/amicorpus/TS3003c/audio/TS3003c.Mix-Headset.wav
  fetch downloads/ami/TS3003d.Mix-Headset.wav ece4a41c37c1092c737d1dfe313afb18248364625991f745fed4b372c3c67eb3 \
    $AMI/AMICorpusMirror/amicorpus/TS3003d/audio/TS3003d.Mix-Headset.wav
fi

if [[ "$group" == all || "$group" == summary ]]; then
  fetch models/llm/Qwen3.5-9B-Q4_K_M.gguf 03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8 \
    $HF/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf
  fetch models/llm/granite-4.2-8b-Q4_K_M.gguf 16a9369d0805f80b7377d25d87f937a90c05dc04ad79173a52001e42c9aab311 \
    $HF/ibm-granite/granite-4.2-8b-GGUF/resolve/93f3f6a8938ee922b784cf4e5b4203cd3428df8f/granite-4.2-8b-Q4_K_M.gguf
  fetch models/llm/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf 33e7a72cf5e6e2cfc2f2847075acc013d68bba023e35310cef86b5cf8fdca761 \
    $HF/mistralai/Ministral-3-8B-Instruct-2512-GGUF/resolve/0102285ad796bd99af90f58de616092e5630e970/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf
fi

# CMake and Ninja for the native builds, at the versions the Mac used.
if [[ "$group" == all || "$group" == tools ]] && [[ "$(uname -s)" == Darwin ]]; then
  if [[ "$(tools/venv/bin/cmake --version 2>/dev/null | head -1)" != "cmake version 4.4.4" ||
        "$(tools/venv/bin/ninja --version 2>/dev/null)" != 1.13.2.git.kitware.jobserver-pipe-1 ]]; then
    rm -rf tools/venv
    python3 -m venv tools/venv
    tools/venv/bin/pip install -q cmake==4.4.4 ninja==1.13.2
  fi
  echo "ok   tools/venv"
fi

# Release builds configured as the Mac's Phase 0 builds were: whisper.cpp and
# llama.cpp with upstream defaults (Metal and Accelerate on), sherpa-onnx as the
# shared C API installed to build/install, which scrb-sherpa links against.
# Windows uses the prebuilt zips in MANIFEST.md.
if [[ "$group" == all || "$group" == build ]] && [[ "$(uname -s)" == Darwin ]]; then
  bin="$root/tools/venv/bin"
  for dir in upstream/whisper.cpp upstream/llama.cpp upstream/sherpa-onnx; do
    extra=()
    if [[ "$dir" == upstream/llama.cpp ]]; then extra=(-DLLAMA_CURL=OFF); fi
    if [[ "$dir" == upstream/sherpa-onnx ]]; then
      extra=(-DBUILD_SHARED_LIBS=ON -DSHERPA_ONNX_ENABLE_BINARY=OFF -DSHERPA_ONNX_BUILD_C_API_EXAMPLES=ON
        -DSHERPA_ONNX_ENABLE_TTS=OFF -DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF -DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF
        -DCMAKE_INSTALL_PREFIX="$root/$dir/build/install")
    fi
    "$bin/cmake" -S "$dir" -B "$dir/build" -G Ninja -DCMAKE_MAKE_PROGRAM="$bin/ninja" \
      -DCMAKE_BUILD_TYPE=Release ${extra[@]+"${extra[@]}"} >/dev/null
    "$bin/cmake" --build "$dir/build" >/dev/null
    if [[ "$dir" == upstream/sherpa-onnx ]]; then "$bin/cmake" --install "$dir/build" >/dev/null; fi
    echo "ok   $dir/build"
  done
fi

echo "done ($group) in $root"
