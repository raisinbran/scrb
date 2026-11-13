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

# Tool sources. A worktree has no build folders, so fall back to the main checkout.
common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
main="${common:+$(dirname "$common")}"
pick() { for d in "$@"; do [[ -e "$d" ]] && { echo "$d"; return; }; done; echo "$1"; }
capture="$(pick "$repo/native/macos-capture/build/scrb-capture" "$main/native/macos-capture/build/scrb-capture")"
tools="$(pick "$repo/packages/transcription/.bin" "$main/packages/transcription/.bin")"
whisper="${assets}/upstream/whisper.cpp/build/bin"
sherpa_lib="${assets}/upstream/sherpa-onnx/build/install/lib"

echo "Scribe build"
echo "  tools from:   $capture, $whisper, $tools, $sherpa_lib"
echo "  output:       $repo/apps/desktop/release/mac-arm64/Scribe.app"
[[ "$mode" == install ]] && echo "  then replaces: /Applications/Scribe.app (your library, settings and models are not touched)"

cd "$repo/apps/desktop"
node "$repo/scripts/stage-mac-tools.mjs" build/mac-stage "$capture" "$whisper" "$tools" "$sherpa_lib"
npm run build
rm -rf release
npx electron-builder --mac dir --arm64 --publish never

app="release/mac-arm64/Scribe.app"
[[ -d "$app" ]] || { echo "Build did not produce $app" >&2; exit 1; }
# Inside-out ad-hoc signing: libraries and tools first, then the whole bundle.
find "$app/Contents/Resources/bin" -type f \( -name '*.dylib' -o -perm -111 \) -exec codesign --force --sign - {} \;
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
