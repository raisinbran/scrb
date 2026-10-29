#!/usr/bin/env bash
# Repeats the Windows model memory and timing runs on Apple Silicon with Metal
# builds (whisper.cpp, llama.cpp) and the CPU sherpa-onnx diarization probe.
# Each step is skipped when its output exists, so the run resumes after an
# interruption (sleep, crash): rerun the script, and delete a partial output first.
#
# Usage (from phase0/): scripts/run-macos-benchmarks.sh [whisper|diarization|summary|all]

set -uo pipefail
cd "$(dirname "$0")/.."
group="${1:-all}"
bin=upstream/whisper.cpp/build/bin
wav=downloads/ami/ES2004a.Mix-Headset.wav
segs=artifacts/whisper-ami/ES2004a-vad-segments.txt
small=models/whisper/ggml-small.en-q5_1.bin
turbo=models/whisper/ggml-large-v3-turbo-q5_0.bin
vad=models/whisper/ggml-silero-v6.2.0.bin
w=artifacts/whisper-ami
d=artifacts/diarization-macos
mkdir -p "$d"

step() {  # step <output> <command...>
  local out="$1"; shift
  if [[ -s "$out" ]]; then echo "skip $out"; return; fi
  echo "run  $out  ($(date +%H:%M:%S))"
  "$@" || echo "FAILED $out" >&2
}

if [[ "$group" == all || "$group" == whisper ]]; then
  # Per-segment accuracy (replay as fast as possible), then real-time live delay on the first 10 min.
  for m in small turbo; do
    model=$small; [[ $m == turbo ]] && model=$turbo
    step "$w/metal-segacc-$m-ac0.json" python3 -I scripts/simulate_live_delay.py "$bin/whisper-server" "$model" "$wav" "$segs" "$w/metal-segacc-$m-ac0.json" 4 1e9 -1 0
    step "$w/metal-live-delay-$m-ac0.json" python3 -I scripts/simulate_live_delay.py "$bin/whisper-server" "$model" "$wav" "$segs" "$w/metal-live-delay-$m-ac0.json" 4 600 0.3 0
  done
  # Whole-file final pass (VAD, no text conditioning) with wall time and peak memory.
  for m in small turbo; do
    model=$small; [[ $m == turbo ]] && model=$turbo
    step "$w/metal-ES2004a-$m-vad-mc0.txt" /usr/bin/time -l "$bin/whisper-cli" -m "$model" -f "$wav" -t 4 \
      --vad --vad-model "$vad" -mc 0 -otxt -of "$w/metal-ES2004a-$m-vad-mc0" 2>"$w/metal-ES2004a-$m-vad-mc0.stderr.txt" >/dev/null
  done
  for f in "$w"/metal-segacc-*-ac0.txt "$w"/metal-ES2004a-*-vad-mc0.txt; do
    echo "WER $f: $(python3 -I scripts/score_ami_wer.py downloads/ami/ann ES2004a "$f")"
  done | tee "$w/metal-wer.txt"
fi

if [[ "$group" == all || "$group" == diarization ]]; then
  seg=models/sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx
  emb=models/sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx
  for meeting in ES2004a IS1009a TS3003a; do
    for config in "inc 10 5 1.2 0.5" "offline 1.2"; do
      tag="${config// /-}"
      hyp="$d/$meeting-$tag.txt"
      if [[ ! -s "$hyp" ]]; then
        echo "run  $hyp  ($(date +%H:%M:%S))"
        # shellcheck disable=SC2086
        probes/live-diarization/LiveDiarize "downloads/ami/$meeting.Mix-Headset.wav" "$hyp" "$seg" "$emb" $config \
          >"$hyp.stats.json" 2>"$d/$meeting-$tag.stderr.txt"
      fi
      score=$(python3 -I scripts/score_der.py downloads/ami/ann/segments "$meeting" "$hyp")
      final=null
      [[ -f "$hyp.final.txt" ]] && final=$(python3 -I scripts/score_der.py downloads/ami/ann/segments "$meeting" "$hyp.final.txt")
      echo "{\"meeting\": \"$meeting\", \"config\": \"$config\", \"stats\": $(cat "$hyp.stats.json"), \"score\": $score, \"final_score\": $final}"
    done
  done | tee "$d/results.jsonl"
fi

if [[ "$group" == all || "$group" == summary ]]; then
  LLAMA_EXTRA_ARGS="-ngl 99" python3 -I scripts/run_summary_benchmark.py upstream/llama.cpp/build/bin/llama-server \
    fixtures/summary artifacts/summary-metal 4 models/llm/Qwen3.5-9B-Q4_K_M.gguf -- ES2016b ES2008b TS3012b
fi
