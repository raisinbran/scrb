#!/bin/bash
# B0 isolated launch for the installed Mac app. Subcommands: prepare | launch | evidence
# The profile AND the library live under the real OS temp root; retained evidence lives in $B0 (outside it).
# Fails closed: any problem exits non-zero, closes the app if it started, and never falls back to the owner's library.
set -euo pipefail
B0="${B0:?set B0}"
APP="${APP:-/Applications/Scribe.app}"
OWNER_LIB="$HOME/Documents/Meeting Scribe"
die() { echo "STOP: $*" >&2; exit 1; }
node_bin() { command -v node >/dev/null || die "node not on PATH"; }

case "${1:-}" in
prepare)
  node_bin; mkdir -p "$B0"
  [ ! -e "$B0/run.env" ] || die "$B0/run.env exists: a run is already prepared (reuse it, do not recreate)"
  TMPROOT=$(node -p "require('fs').realpathSync(require('os').tmpdir())")
  RUN=$(mktemp -d "$TMPROOT/scrb-b0-XXXXXX")
  mkdir "$RUN/profile" "$RUN/library"
  node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ root: process.argv[2] }))' "$RUN/profile/library-location.json" "$RUN/library"
  case "$RUN" in "$OWNER_LIB"*|"$HOME/Library/Application Support/Scribe"*) die "temp run folder is inside the owner's data";; esac
  printf 'RUN=%q\nPROFILE=%q\nLIB=%q\n' "$RUN" "$RUN/profile" "$RUN/library" > "$B0/run.env"
  cat "$B0/run.env" ;;
launch)
  [ -f "$B0/run.env" ] || die "run prepare first"
  # shellcheck disable=SC1091
  . "$B0/run.env"
  [ -d "$APP" ] || die "no app at $APP"
  pgrep -x Scribe >/dev/null && die "Scribe is already running"
  [ "$(node -p "require('fs').realpathSync(process.argv[1])" "$PROFILE")" = "$PROFILE" ] || die "profile path is not canonical"
  [ "$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).root" "$PROFILE/library-location.json")" = "$LIB" ] || die "pointer does not name the disposable library"
  open -n "$APP" --args --user-data-dir="$PROFILE" --scrb-isolated-test-profile
  # Only processes started with this run's own --user-data-dir are ever signalled; another Scribe is left alone.
  mine() { pgrep -f -- "--user-data-dir=$PROFILE( |\$)" || true; }
  stop_app() {
    local p; p=$(mine)
    if [ -n "$p" ]; then echo "$p" | xargs kill 2>/dev/null || true; else echo "no process of this isolated profile found; nothing was killed" >&2; fi
  }
  ok=0
  for _ in $(seq 1 30); do
    sleep 1
    pid=$(mine | paste -sd, -)
    [ -n "$pid" ] || continue
    if [ -e "$LIB/index.sqlite" ] && lsof -p "$pid" 2>/dev/null | grep -qF "$LIB/"; then ok=1; break; fi
  done
  [ "$ok" = 1 ] || { stop_app; die "no live Scribe process holding a file in $LIB within 30 s (the app exits on a rejected isolated profile); nothing else is used"; }
  if lsof -p "$pid" 2>/dev/null | grep -qF "$OWNER_LIB"; then stop_app; die "app holds a file in the owner's library"; fi
  echo "ISOLATION OK: pid(s) $pid holds files under $LIB; profile $PROFILE"
  echo "Now read Settings > storage location on screen: it must show exactly $LIB. If it does not, quit the app by hand (only the window opened by this launch)" ;;
evidence)
  [ -f "$B0/run.env" ] || die "run prepare first"
  . "$B0/run.env"
  [ -n "${2:-}" ] || die "usage: evidence <label>"
  dest="$B0/evidence/$2"; [ ! -e "$dest" ] || die "$dest exists"
  mkdir -p "$B0/evidence"; ditto "$LIB" "$dest"
  (cd "$dest" && LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256) > "$B0/evidence/$2.sha256"
  echo "copied $LIB to $dest; digests in $B0/evidence/$2.sha256" ;;
*) echo "usage: $0 prepare|launch|evidence <label>" >&2; exit 64 ;;
esac
