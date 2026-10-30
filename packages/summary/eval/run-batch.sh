#!/bin/zsh
# usage: run-batch.sh <fixtures_dir> <out_dir> <meeting>...  (FLAGS="..." for run.js options). One lock per meeting.
export PATH=~/.local/share/scrb-node/current/bin:$PATH
F=$1; O=$2; shift 2
for m in "$@"; do lockf -k ~/.local/share/scrb-node/model.lock taskpolicy -c utility node dist/eval/run.js $F $O $m $=FLAGS 2>&1 | tail -1 | cut -c1-400; done
