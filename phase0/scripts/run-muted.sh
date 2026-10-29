#!/usr/bin/env bash
# Runs a command with the speakers muted and restores the previous mute state
# afterwards (Ctrl-C included).  The process tap records before the device
# volume, so captures still carry full-level audio.
#
# Usage (from phase0/): scripts/run-muted.sh <command...>
was_muted=$(osascript -e 'output muted of (get volume settings)')
restore() { [[ "$was_muted" == true ]] || osascript -e 'set volume without output muted'; }
trap restore EXIT
osascript -e 'set volume with output muted'
[[ "$(osascript -e 'output muted of (get volume settings)')" == true ]] || { echo "could not mute; stopping"; exit 1; }
"$@"
