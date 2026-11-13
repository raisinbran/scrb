#!/usr/bin/env bash
# Starts the desktop app in real mode (dev build): real recording, live text and final pass.
# Fails before launching if anything the real mode needs is missing, so the app never
# falls back to the mock without the owner noticing.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
assets="${HOME}/scrb-dev-assets/config"
export PATH="${HOME}/.local/share/scrb-node/current/bin:${PATH}"

helper="${repo}/native/macos-capture/build/scrb-capture"
if [[ ! -x "$helper" ]]; then
  # A worktree has no build folder; the main checkout, the parent of the shared .git, does.
  common="$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  [[ -n "$common" ]] && helper="$(dirname "$common")/native/macos-capture/build/scrb-capture"
fi
live="${assets}/live.json"
final="${assets}/final-pass.json"

missing=()
[[ -x "$helper" ]] || missing+=("capture helper: ${helper} (build it: cd native/macos-capture && ./build.sh)")
[[ -f "$live" ]] || missing+=("live config: ${live}")
[[ -f "$final" ]] || missing+=("final-pass config: ${final}")
# Keys the app requires (backend.ts readLiveSetup; app-core final-pass.ts loadSetup; ffprobe for imports).
live_keys="tools.whisperServer tools.whisperVad models.speechLive models.vad"
final_keys="tools.ffmpeg tools.ffprobe tools.whisperCli tools.sherpaSidecar models.speechFinal models.vad models.segmentation models.embedding"
problems() {  # problems <config> <keys>: prints one problem per line for a bad key or a missing path
  node -e '
    const fs = require("fs");
    let c;
    try { c = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); }
    catch { console.log("is not valid JSON"); process.exit(); }
    for (const key of process.argv[2].split(" ")) {
      const [group, name] = key.split(".");
      const v = c?.[group]?.[name];
      if (typeof v !== "string" || v === "") console.log(`lacks a non-empty "${key}"`);
      else if (!fs.existsSync(v)) console.log(`"${key}" points to a missing file: ${v}`);
    }
  ' "$1" "$2"
}
check_config() {  # check_config <label> <config> <keys>
  [[ -f "$2" ]] || return 0
  local line
  while IFS= read -r line; do missing+=("$1 $line (in $2)"); done < <(problems "$2" "$3")
}
command -v node >/dev/null 2>&1 || missing+=("node (expected in ${HOME}/.local/share/scrb-node/current/bin)")
check_config "live config" "$live" "$live_keys"
check_config "final-pass config" "$final" "$final_keys"
command -v npm >/dev/null 2>&1 || missing+=("npm (expected in ${HOME}/.local/share/scrb-node/current/bin)")
if ((${#missing[@]} > 0)); then
  echo "Cannot start real mode. Missing:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

# The app allows one running copy. A second launch hands over to the old one and quits, so a
# copy left running from before a pull would silently show old code. Refuse instead.
# Matches the dev app's main process (not helpers) and an installed Meeting Scribe.
running="$(ps -axo pid=,command= 2>/dev/null | grep -E '/node_modules/electron/dist/Electron\.app/Contents/MacOS/Electron( |$)|/Meeting Scribe\.app/Contents/MacOS/' | grep -v grep || true)"
if [[ -n "$running" ]]; then
  echo "Meeting Scribe is already running, so a new start would just reopen the old copy." >&2
  echo "Quit it first: click the Meeting Scribe window, press Cmd+Q, then run this again." >&2
  echo "If it will not quit, run: pkill -f 'node_modules/electron/dist/Electron.app'" >&2
  exit 1
fi

export SCRB_CAPTURE_HELPER="$helper"
export SCRB_LIVE_CONFIG="$live"
export SCRB_FINAL_PASS_CONFIG="$final"
cd "$repo"
exec npm start -w @scrb/desktop
