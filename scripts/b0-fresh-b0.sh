#!/bin/bash
# Shared B0 evidence-directory guard. Source it (the swap and launch scripts do), or run: create | check
# B0 must be a fresh, dedicated, non-symlink directory made by `create` (plain mkdir, fails if anything is
# there, including a dangling symlink) and carrying the marker .b0-run. Its canonical path must be disjoint
# (neither inside nor containing) from the owner's library, the Scribe application-support folder, the target
# app and /Applications. Nothing may be written before this passes.
set -euo pipefail

b0_die() { echo "STOP: $*" >&2; exit 1; }
b0_canon() { (cd -P "$1" 2>/dev/null && pwd -P); }
b0_overlap() { case "$1/" in "$2"/*) return 0;; esac; case "$2/" in "$1"/*) return 0;; esac; return 1; }

# Refuse a path that overlaps a protected owner location. $1 = candidate canonical path.
b0_disjoint() {
  local p c
  for p in "$HOME/Documents/Meeting Scribe" "$HOME/Library/Application Support/Scribe" "${B0_APP:-/Applications/Scribe.app}" "$(dirname "${B0_APP:-/Applications/Scribe.app}")" /Applications; do
    c=$(b0_canon "$p" || echo "$p")
    if b0_overlap "$1" "$c"; then b0_die "B0 ($1) overlaps a protected location: $c"; fi
  done
}

# A write destination that must not exist yet (a dangling symlink counts as existing).
b0_fresh_dest() { if [ -e "$1" ] || [ -L "$1" ]; then b0_die "refusing to write: $1 already exists or is a symlink"; fi; }

# Evidence label: one simple directory name.
b0_label_ok() { [[ "$1" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]*$ ]] || b0_die "bad evidence label (use letters, digits, . _ -): $1"; }

# First step of the run: create the dedicated directory, before any stimulus or backup write.
b0_create() {
  local parent canonical
  [ -n "${B0:-}" ] || b0_die "set B0"
  b0_fresh_dest "$B0"
  parent=$(b0_canon "$(dirname "$B0")") || b0_die "parent of B0 must exist"
  canonical="$parent/$(basename "$B0")"
  b0_disjoint "$canonical"
  mkdir "$canonical"
  : > "$canonical/.b0-run"
  echo "created $canonical"
}

# Every later step: B0 is the dedicated directory (resolves B0 to its canonical path).
b0_require() {
  [ -n "${B0:-}" ] || b0_die "set B0"
  if [ -L "$B0" ]; then b0_die "B0 is a symlink: $B0"; fi
  [ -d "$B0" ] || b0_die "B0 does not exist; run scripts/b0-fresh-b0.sh create first: $B0"
  B0=$(b0_canon "$B0") || b0_die "cannot resolve B0"
  if [ ! -f "$B0/.b0-run" ] || [ -L "$B0/.b0-run" ]; then b0_die "$B0 is not a directory made by scripts/b0-fresh-b0.sh create"; fi
  b0_disjoint "$B0"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  case "${1:-}" in
  create) b0_create ;;
  check) b0_require; echo "B0 OK: $B0" ;;
  *) echo "usage: $0 create|check (env B0, optional B0_APP)" >&2; exit 64 ;;
  esac
fi
