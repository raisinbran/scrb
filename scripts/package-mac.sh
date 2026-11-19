#!/usr/bin/env bash
# Builds Scribe.app (Apple Silicon, ad-hoc signed) and optionally installs it.
#
#   scripts/package-mac.sh --install-models   copy the five models into
#                                             ~/Library/Application Support/Scribe/models (hash-checked)
#   scripts/package-mac.sh                    build only: apps/desktop/release/mac-arm64/Scribe.app
#   scripts/package-mac.sh --install          build, then replace /Applications/Scribe.app
#
# Run from the scrb folder in Terminal. No admin password is needed unless /Applications refuses
# the copy. Library, settings and models are never touched by a build or an install.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="${HOME}/.local/share/scrb-node/current/bin:${PATH}"
assets="${SCRB_DEV_ASSETS:-$HOME/scrb-dev-assets}"
export SCRB_DEV_ASSETS="$assets"
models_dest="${SCRB_MODELS_DIR:-$HOME/Library/Application Support/Scribe/models}"
digests="${repo}/scripts/model-digests.json"
archive_sha=24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488

sha256() { shasum -a 256 "$1" | cut -d' ' -f1; }
digest() { node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))[process.argv[2]].sha256)' "$digests" "$1"; }

install_models() {
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  local arc="${assets}/models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2"
  [[ -f "$arc" ]] || { echo "Missing $arc (run scripts/dev-assets.sh first)" >&2; exit 1; }
  [[ "$(sha256 "$arc")" == "$archive_sha" ]] || { echo "Segmentation archive hash differs; refusing it." >&2; exit 1; }
  tar -xjf "$arc" -C "$tmp"
  declare -a src=(
    "ggml-large-v3-turbo-q5_0.bin:${assets}/models/whisper/ggml-large-v3-turbo-q5_0.bin"
    "ggml-small.en-q5_1.bin:${assets}/models/whisper/ggml-small.en-q5_1.bin"
    "ggml-silero-v6.2.0.bin:${assets}/models/whisper/ggml-silero-v6.2.0.bin"
    "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx:${assets}/models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
    "segmentation-model.int8.onnx:${tmp}/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx"
  )
  mkdir -p "$models_dest"
  local row name file
  for row in "${src[@]}"; do
    name="${row%%:*}"; file="${row#*:}"
    [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 1; }
    [[ "$(sha256 "$file")" == "$(digest "$name")" ]] || { echo "Hash differs, not copied: $name" >&2; exit 1; }
    cp "$file" "${models_dest}/${name}.part" && mv "${models_dest}/${name}.part" "${models_dest}/${name}"
    echo "installed ${models_dest}/${name}"
  done
}

mode=build
case "${1:-}" in
  --install-models) install_models; exit 0 ;;
  --install) mode=install ;;
  "") ;;
  *) echo "Unknown option $1" >&2; exit 2 ;;
esac

assert_asset_commit() {
  local path="$1" expected="$2" actual
  actual="$(git -C "$path" rev-parse HEAD)"
  [[ "$actual" == "$expected" ]] || {
    echo "Unexpected source revision at $path: $actual (expected $expected)" >&2
    exit 1
  }
}
assert_asset_commit "${assets}/upstream/whisper.cpp" 284029c07012d2000941a08d38a31ffb71f4734e
assert_asset_commit "${assets}/upstream/sherpa-onnx" af2d8d81dbfa61c4cea4c568da78f3982edca005
assert_asset_commit "${assets}/upstream/llama.cpp" 369dcf309c8b274370e692ac2d42d9708597ae04
assert_asset_commit "${assets}/upstream/opus" 251d657e92fccfa3b05baec4f05756cce252fb75

# Build the capture helper from this checkout every time so a stale ignored
# build artifact cannot silently enter the package.
capture="$repo/native/macos-capture/build/scrb-capture"
(
  cd "$repo/native/macos-capture"
  OUT="$capture" bash ./build.sh
)

# Runtime tools are built into this checkout. Do not select binaries from a
# different checkout, whose source provenance may not match this package.
tools="$repo/packages/transcription/.bin"
whisper="${assets}/upstream/whisper.cpp/build/bin"
sherpa_lib="${assets}/upstream/sherpa-onnx/build/install/lib"
llama="${assets}/upstream/llama.cpp/build/bin"

[[ -x "$tools/ffmpeg" && -x "$tools/ffprobe" ]] || {
  echo "Missing FFmpeg tools in this checkout; build with packages/transcription/scripts/build-ffmpeg.sh" >&2
  exit 1
}
[[ -x "$tools/scrb-sherpa" ]] || {
  echo "Missing sherpa sidecar in this checkout; build with SHERPA_ONNX_DIR=${assets}/upstream/sherpa-onnx/build/install packages/transcription/scripts/build-sherpa-sidecar.sh" >&2
  exit 1
}

echo "Scribe build"
echo "  tools from:   $capture, $whisper, $tools, $sherpa_lib, $llama"
echo "  output:       $repo/apps/desktop/release/mac-arm64/Scribe.app"
[[ "$mode" == install ]] && echo "  then replaces: /Applications/Scribe.app (your library, settings and models are not touched)"

cd "$repo/apps/desktop"
node "$repo/scripts/stage-mac-tools.mjs" build/mac-stage "$capture" "$whisper" "$tools" "$llama" "$sherpa_lib"
license_out="build/mac-stage/bin/licenses"
mkdir -p "$license_out"
cp "$repo/third_party/THIRD_PARTY_NOTICES.md" build/mac-stage/bin/THIRD_PARTY_NOTICES.md
cp "$repo/packages/transcription/THIRD_PARTY_NOTICES.md" build/mac-stage/bin/TRANSCRIPTION_THIRD_PARTY_NOTICES.md
copy_license() {
  local source="$1" name="$2"
  [[ -f "$source" ]] || { echo "Missing required license/notice: $source" >&2; exit 1; }
  cp "$source" "$license_out/$name"
}
copy_license "$repo/packages/transcription/licenses/windows/FFmpeg-COPYING.LGPLv2.1.txt" FFmpeg-LGPL-2.1.txt
copy_license "$repo/packages/transcription/licenses/windows/opus-COPYING.txt" opus-BSD-3-Clause.txt
copy_license "$repo/packages/transcription/licenses/windows/whisper.cpp-LICENSE.txt" whisper.cpp-MIT.txt
copy_license "$repo/packages/transcription/licenses/windows/sherpa-onnx-LICENSE.txt" sherpa-onnx-Apache-2.0.txt
copy_license "$repo/packages/transcription/licenses/windows/onnxruntime-LICENSE.txt" onnxruntime-MIT.txt
copy_license "$repo/third_party/licenses/llama.cpp-MIT.txt" llama.cpp-MIT.txt
copy_license "$assets/upstream/llama.cpp/vendor/cpp-httplib/LICENSE" cpp-httplib-MIT.txt
copy_license "$assets/upstream/llama.cpp/licenses/LICENSE-jsonhpp" jsonhpp-MIT.txt
copy_license "$assets/upstream/sherpa-onnx/build/_deps/onnxruntime-src/ThirdPartyNotices.txt" onnxruntime-THIRD-PARTY-NOTICES.txt
copy_license "$assets/models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/LICENSE" pyannote-segmentation-MIT.txt
npm run build
rm -rf release
npx electron-builder --mac dir --arm64 --publish never

app="release/mac-arm64/Scribe.app"
[[ -d "$app" ]] || { echo "Build did not produce $app" >&2; exit 1; }
# Inside-out ad-hoc signing: libraries and tools first, then the whole bundle.
find "$app/Contents/Resources/bin" -type f \( -name '*.dylib' -o -perm -111 \) -exec codesign --force --sign - {} \;
node "$repo/scripts/write-mac-provenance.mjs" "$app" "$repo" "$assets" "$capture" "$whisper" "$tools" "$llama" "$sherpa_lib"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"
echo "Built and verified: $PWD/$app ($(du -sh "$app" | cut -f1))"

if [[ "$mode" == install ]]; then
  if pgrep -f "/Applications/Scribe.app/Contents/MacOS/Scribe" >/dev/null; then
    echo "Scribe is running. Quit it (Cmd+Q), then run this again." >&2; exit 1
  fi
  echo "Replacing /Applications/Scribe.app"
  rm -rf /Applications/Scribe.app
  cp -R "$app" /Applications/Scribe.app
  echo "Installed. Open it from /Applications."
fi
