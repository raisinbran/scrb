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

# Transcribes the test clip with the fake engine and checks that the
# transcript has two speakers.
transcribe_clip() {
  local scratch library
  scratch=$(mktemp -d)
  library=$(mktemp -d)
  cargo build --locked -q &&
    SCRB_ENGINE="target/debug/scrb dev fake-engine --ref crates/scrb/tests/data/two-speakers.ref.json" \
      target/debug/scrb transcribe crates/scrb/tests/data/two-speakers.wav \
      --library "$library" --out "$scratch/out.json" | tail -n1 | jq -e .ok &&
    jq -e '.speakers|length==2' "$scratch/out.json"
}

run_step fmt cargo fmt --all -- --check
run_step clippy cargo clippy --workspace --all-targets --locked -- -D warnings
run_step test cargo test --workspace --locked
run_step transcribe transcribe_clip

joined=$(IFS=,; echo "${steps[*]}")
echo "{\"ok\":$all_ok,\"steps\":[$joined]}"
[ "$all_ok" = true ]
