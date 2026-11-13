#!/usr/bin/env bash
# Proves scripts/m1.sh refuses to start when files are missing. Run: bash scripts/m1.test.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fake="$(mktemp -d)"
trap 'rm -rf "$fake"' EXIT
# An empty HOME has no configs; the helper is also absent in a copy outside any checkout.
mkdir -p "$fake/repo/scripts"
cp "$here/m1.sh" "$fake/repo/scripts/m1.sh"
set +e
out="$(HOME="$fake" bash "$fake/repo/scripts/m1.sh" 2>&1)"
code=$?
set -e
[[ $code -ne 0 ]] || { echo "FAIL: exited 0"; exit 1; }
for want in "capture helper" "live.json" "final-pass.json"; do
  grep -q "$want" <<<"$out" || { echo "FAIL: message lacks '$want'"; echo "$out"; exit 1; }
done
echo "ok"
