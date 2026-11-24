#!/bin/bash
# B0 Mac app swap with fail-closed rollback. Subcommands: fingerprint <dir> | backup | swap | rollback
# Env: B0 (evidence folder, outside the temp profile), APPS (default /Applications), CAND (built Scribe.app),
#      EXPECT_FILES, EXPECT_LINKS (full 64-hex digests of CAND). Test hook: B0_TEST_MODE=1 skips codesign and
#      the running-app check; it is refused unless the canonical APPS is a marked rehearsal tree under the temp root. B0_TEST_FAIL_AFTER_MOVE=1 (test mode only)
#      injects a failure after the second rename to prove the automatic rollback.
set -euo pipefail
canon() { (cd -P "$1" 2>/dev/null && pwd -P); }
APPS_IN="${APPS:-/Applications}"
APPS=$(canon "$APPS_IN") || { echo "STOP: cannot resolve APPS=$APPS_IN" >&2; exit 64; }
B0="${B0:?set B0}"
PROD=$(canon /Applications) || PROD=/Applications
LIVE="$APPS/Scribe.app"
# Test mode may only act on a disposable rehearsal tree: canonical path under the canonical OS temp root,
# never the canonical /Applications (so a trailing slash or symlink alias cannot bypass this), and marked by
# the file .b0-rehearsal-tree that the rehearsal step creates. Production mode keeps every gate.
if [ "${B0_TEST_MODE:-0}" = 1 ]; then
  TMPROOT=$(canon "${TMPDIR:-/tmp}") || { echo "STOP: cannot resolve temp root" >&2; exit 64; }
  case "$APPS/" in "$TMPROOT"/*) ;; *) echo "refused: test mode APPS must be inside $TMPROOT" >&2; exit 64 ;; esac
  case "$APPS/" in "$PROD"/*) echo "refused: test mode on /Applications" >&2; exit 64 ;; esac
  B0_CANON=$(canon "$B0") || { echo "refused: test mode B0 must be an existing directory" >&2; exit 64; }
  case "$B0_CANON/" in "$TMPROOT"/*) ;; *) echo "refused: test mode B0 must be inside $TMPROOT" >&2; exit 64 ;; esac
  case "$B0_CANON/" in "$PROD"/*) echo "refused: test mode B0 inside /Applications" >&2; exit 64 ;; esac
  B0="$B0_CANON"
  [ -f "$APPS/.b0-rehearsal-tree" ] && [ ! -L "$APPS/.b0-rehearsal-tree" ] || { echo "refused: $APPS lacks the .b0-rehearsal-tree marker" >&2; exit 64; }
fi

die() { echo "STOP: $*" >&2; exit 1; }

# Two digests: regular files (path-safe, bytewise order) and symlink targets. Modes, xattrs, signature excluded.
fingerprint() {
  local d="$1" f l
  [ -d "$d" ] || die "no such app: $d"
  f=$(cd "$d" && LC_ALL=C find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
  l=$(cd "$d" && LC_ALL=C find . -type l -print0 | LC_ALL=C sort -z |
      while IFS= read -r -d '' p; do printf '%s -> %s\n' "$p" "$(readlink "$p")"; done | shasum -a 256 | cut -d' ' -f1)
  printf 'files=%s\nlinks=%s\n' "$f" "$l"
}
hex64() { [[ "$1" =~ ^[0-9a-f]{64}$ ]] || die "not a full 64-hex digest: $1"; }
field() { sed -n "s/^$2=//p" "$1" | head -n1; }
same_volume() { [ "$(stat -f %d "$1")" = "$(stat -f %d "$2")" ] || die "$1 and $2 are on different volumes"; }
verify_against() { # <dir> <expected files> <expected links> <label>
  local got; got=$(fingerprint "$1")
  [ "$(printf '%s\n' "$got" | sed -n 's/^files=//p')" = "$2" ] || die "$4: file digest mismatch"
  [ "$(printf '%s\n' "$got" | sed -n 's/^links=//p')" = "$3" ] || die "$4: symlink digest mismatch"
}
codesign_ok() { [ "${B0_TEST_MODE:-0}" = 1 ] || codesign --verify --deep --strict "$1" || die "codesign failed: $1"; }
idle() { [ "${B0_TEST_MODE:-0}" = 1 ] || ! pgrep -x Scribe >/dev/null || die "Scribe is running"; }

do_rollback() { # restores $B0/Scribe.app.replaced to LIVE and proves it matches backup.sha; never uses rm
  [ -d "$B0/Scribe.app.replaced" ] || die "rollback impossible: $B0/Scribe.app.replaced missing (restore from $B0/Scribe.app.backup)"
  if [ -e "$LIVE" ]; then mv "$LIVE" "$B0/Scribe.app.rc.$$" || die "cannot move candidate aside"; fi
  mv "$B0/Scribe.app.replaced" "$LIVE" || die "cannot restore previous app"
  verify_against "$LIVE" "$(field "$B0/backup.sha" files)" "$(field "$B0/backup.sha" links)" "rollback"
  echo "ROLLED BACK to the previous app (digests match backup.sha)"
}

case "${1:-}" in
fingerprint) fingerprint "${2:?dir}" ;;
backup)
  idle; mkdir -p "$B0"; same_volume "$B0" "$APPS"
  [ ! -e "$B0/Scribe.app.backup" ] || die "backup already exists; refusing to overwrite"
  fingerprint "$LIVE" > "$B0/backup.sha.tmp"
  ditto "$LIVE" "$B0/Scribe.app.backup"
  fingerprint "$B0/Scribe.app.backup" > "$B0/backup.copy.sha"
  cmp -s "$B0/backup.sha.tmp" "$B0/backup.copy.sha" || die "backup copy differs from the live app"
  fingerprint "$LIVE" | cmp -s - "$B0/backup.sha.tmp" || die "live app changed during backup"
  mv "$B0/backup.sha.tmp" "$B0/backup.sha"; echo "backup OK"; cat "$B0/backup.sha" ;;
swap)
  : "${CAND:?set CAND}" "${EXPECT_FILES:?}" "${EXPECT_LINKS:?}"
  hex64 "$EXPECT_FILES"; hex64 "$EXPECT_LINKS"
  idle; same_volume "$B0" "$APPS"
  [ -s "$B0/backup.sha" ] || die "run backup first"
  [ ! -e "$B0/Scribe.app.replaced" ] || die "Scribe.app.replaced already exists"
  [ ! -e "$APPS/Scribe.new.app" ] || die "$APPS/Scribe.new.app already exists"
  verify_against "$LIVE" "$(field "$B0/backup.sha" files)" "$(field "$B0/backup.sha" links)" "live app vs backup"
  codesign_ok "$CAND"; verify_against "$CAND" "$EXPECT_FILES" "$EXPECT_LINKS" "candidate"
  armed=0
  on_exit() { rc=$?; trap - EXIT
    if [ "$rc" -ne 0 ]; then
      echo "swap failed (exit $rc)" >&2
      [ -d "$APPS/Scribe.new.app" ] && mv "$APPS/Scribe.new.app" "$B0/Scribe.new.app.failed.$$" || true
      if [ "$armed" = 1 ]; then do_rollback || echo "ROLLBACK FAILED: restore $B0/Scribe.app.backup by hand" >&2; fi
    fi; exit "$rc"; }
  trap on_exit EXIT
  ditto "$CAND" "$APPS/Scribe.new.app"
  verify_against "$APPS/Scribe.new.app" "$EXPECT_FILES" "$EXPECT_LINKS" "staged copy"
  codesign_ok "$APPS/Scribe.new.app"
  armed=1
  mv "$LIVE" "$B0/Scribe.app.replaced"
  mv "$APPS/Scribe.new.app" "$LIVE"
  [ "${B0_TEST_MODE:-0}" = 1 ] && [ "${B0_TEST_FAIL_AFTER_MOVE:-0}" = 1 ] && die "injected failure after the swap (test only)"
  verify_against "$LIVE" "$EXPECT_FILES" "$EXPECT_LINKS" "installed app"
  codesign_ok "$LIVE"
  armed=0; echo "SWAP OK; previous app kept at $B0/Scribe.app.replaced" ;;
rollback) idle; same_volume "$B0" "$APPS"; do_rollback ;;
*) echo "usage: $0 fingerprint <dir>|backup|swap|rollback" >&2; exit 64 ;;
esac
