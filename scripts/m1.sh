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
# Every tool and model path named inside a config must exist too (config values under "tools" and "models").
referenced() {  # referenced <config>: prints one path per line, or "unreadable" when it is not valid JSON
  node -e '
    const c = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    for (const k of ["tools", "models"]) for (const v of Object.values(c[k] ?? {})) console.log(v);
  ' "$1" 2>/dev/null || echo "unreadable"
}
check_config() {  # check_config <label> <config>
  [[ -f "$2" ]] || return 0
  local path
  while IFS= read -r path; do
    if [[ "$path" == unreadable ]]; then missing+=("$1 is not valid JSON: $2"); return 0; fi
    [[ -e "$path" ]] || missing+=("$1 references a missing file: ${path} (in $2)")
  done < <(referenced "$2")
}
command -v node >/dev/null 2>&1 || missing+=("node (expected in ${HOME}/.local/share/scrb-node/current/bin)")
check_config "live config" "$live"
check_config "final-pass config" "$final"
command -v npm >/dev/null 2>&1 || missing+=("npm (expected in ${HOME}/.local/share/scrb-node/current/bin)")
if ((${#missing[@]} > 0)); then
  echo "Cannot start real mode. Missing:" >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi

export SCRB_CAPTURE_HELPER="$helper"
export SCRB_LIVE_CONFIG="$live"
export SCRB_FINAL_PASS_CONFIG="$final"
cd "$repo"
exec npm start -w @scrb/desktop
