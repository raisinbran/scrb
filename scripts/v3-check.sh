#!/usr/bin/env bash
# Runs v3's checks from the repository root and prints one JSON line, such as
# {"ok":true,"steps":[{"name":"fmt","ok":true}]}. Each step's own output goes
# to stderr. The exit code is 1 when a step fails.
set -u
cd "$(dirname "$0")/.."

all_ok=true
steps=()

run_step() {
  local name=$1
  shift
  local ok=true
  if ! "$@" >&2; then
    ok=false
    all_ok=false
  fi
  steps+=("{\"name\":\"$name\",\"ok\":$ok}")
}

run_step fmt cargo fmt --all -- --check
run_step clippy cargo clippy --workspace --all-targets --locked -- -D warnings
run_step test cargo test --workspace --locked

joined=$(IFS=,; echo "${steps[*]}")
echo "{\"ok\":$all_ok,\"steps\":[$joined]}"
[ "$all_ok" = true ]
