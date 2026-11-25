#!/bin/bash
# Gate 5 Stage 2 decode runner (docs/gates/vocab-gate5-stage2-results-20261125.md). Each decode runs once, no retries.
# Usage: vocab_stage2_run.sh off|on|neg   (outputs under $E/s2/<phase>/, plan in $E/s2/plan.json for on|neg)
# Needs SCRB_DEV_ASSETS layout (~/scrb-dev-assets). whisper.cpp 284029c; args = wholeFileArgs with -mc 128 (HINTED_MAX_CONTEXT).
R=${SCRB_DEV_ASSETS:-$HOME/scrb-dev-assets}; E=$R/eval-vocab; S=$E/s2; A=$R/downloads/ami
W=$R/upstream/whisper.cpp/build/bin/whisper-cli; M=$R/models/whisper/ggml-large-v3-turbo-q5_0.bin; V=$R/models/whisper/ggml-silero-v6.2.0.bin
LOG=$S/command-log.md; phase=$1
wav() { [ -f "$E/neg/$1.Mix-Headset.wav" ] && echo "$E/neg/$1.Mix-Headset.wav" || echo "$A/$1.Mix-Headset.wav"; }
run() { # outname meeting hintfile|-
  local out=$S/$phase/$1 s=$(date +%s) extra=()
  [ "$3" != - ] && extra=(--prompt "$(cat "$3")" --carry-initial-prompt)
  echo "$(date -u +%FT%TZ) START $phase/$1 meeting=$2 hint=$3" >> $LOG
  echo "$W -m $M -f $(wav $2) -t 4 -l en --vad --vad-model $V -mc 128 -ml 1 -sow -ojf -of $out -np -pp ${extra[*]:+--prompt <$3> --carry-initial-prompt}" >> $LOG
  "$W" -m "$M" -f "$(wav $2)" -t 4 -l en --vad --vad-model "$V" -mc 128 -ml 1 -sow -ojf -of "$out" -np -pp "${extra[@]}" >"$out.stdout" 2>"$out.stderr"
  local rc=$?; echo "$(date -u +%FT%TZ) END $phase/$1 rc=$rc secs=$(( $(date +%s)-s ))" >> $LOG
  [ $rc -ne 0 ] && { echo "FAILED $phase/$1" >> $LOG; exit 1; }
}
mkdir -p $S/$phase
if [ $phase = off ]; then
  for m in $(python3 -c "import json;print(' '.join(json.load(open('$S/meetings.json'))))"); do run $m $m -; done
else
  python3 -c "
import json
for j in json.load(open('$S/plan.json'))['$phase']: print(j['out'], j['meeting'], j['hint'])" | while read o m h; do run $o $m $S/$h; done
fi
echo "$(date -u +%FT%TZ) PHASE $phase DONE" >> $LOG
