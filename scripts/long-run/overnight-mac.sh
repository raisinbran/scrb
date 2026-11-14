#!/usr/bin/env bash
# Gate 8 overnight long run on the Mac. See docs/plans/long-run-overnight.md.
# Default is a 5-minute smoke. Anything longer needs an explicit --hours (and the owner's approval).
# The evidence folder must be new or empty and outside the repo; the driver checks that before anything starts.
# Usage: scripts/long-run/overnight-mac.sh [--hours N] [--helper <scrb-capture>] [--out <folder outside git>]
# Keeps the Mac awake with caffeinate (no admin), mutes the speakers (the capture tap records before the
# volume), records a generated 880 Hz tone on the meeting track and the default mic, then checks the result.
# Stop early and safely: touch <out>/STOP, or press Ctrl+C once.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
hours=""; helper=""; out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hours) hours="$2"; shift 2 ;;
    --smoke) hours=""; shift ;;
    --helper) helper="$2"; shift 2 ;;
    --out) out="$2"; shift 2 ;;
    *) echo "unknown option $1"; exit 2 ;;
  esac
done
export PATH="$HOME/.local/share/scrb-node/current/bin:$PATH"
if [[ -z "$helper" ]]; then
  for candidate in "$repo/native/macos-capture/build/scrb-capture" "$(git -C "$repo" rev-parse --git-common-dir 2>/dev/null)/../native/macos-capture/build/scrb-capture"; do
    [[ -x "$candidate" ]] && helper="$candidate" && break
  done
fi
[[ -x "$helper" ]] || { echo "no helper: build it with native/macos-capture/build.sh or pass --helper"; exit 2; }
seconds=300
[[ -n "$hours" ]] && seconds=$(awk -v h="$hours" 'BEGIN { printf "%d", h * 3600 }')
stamp="$(date +%Y%m%d-%H%M%S)"
[[ -n "$out" ]] || out="$HOME/scrb-long-run/$([[ $seconds -le 300 ]] && echo smoke-)$stamp"
echo "helper:   $helper"
echo "evidence: $out"
echo "stop early: touch '$out/STOP'   (or Ctrl+C once)"
# caffeinate -d -i -m -s: keep display, idle, disk and system awake while the command runs. Needs mains power for -s.
caffeinate -dims "$repo/native/macos-capture/scripts/run-muted.sh" \
  node --experimental-transform-types "$repo/scripts/long-run/overnight.mjs" \
  --helper "$helper" --work "$out" --seconds "$seconds"
