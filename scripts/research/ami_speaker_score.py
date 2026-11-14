"""Scores sweep hypotheses against AMI annotations, clipped to the dumped duration.

Usage: python -I ami_speaker_score.py <ami_segments_dir> <hyp_dir> <seconds> <out.json>
Reports per config and meeting: reference and hypothesis speaker counts, DER (0.25 s collar,
overlap counted, from scripts/eval/score_der.py), and speakers by the one-to-one mapping:
`extra` = hypothesis speakers matched to no reference speaker (a real voice split in two, or
noise), `missed` = reference speakers matched to no hypothesis speaker.
"""
import importlib.util
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("score_der", os.path.join(here, "..", "eval", "score_der.py"))
sd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sd)

seg_dir, hyp_dir, seconds, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]


def clip(segs):
    return [(s, min(e, seconds), k) for s, e, k in segs if s < seconds]


def score(meeting, path, collar=0.25):
    ref = clip(sd.load_reference(seg_dir, meeting))
    hyp = clip(sd.load_hypothesis(path))
    n = int(seconds / sd.FRAME) + 1
    rf, hf = sd.to_frames(ref, n), sd.to_frames(hyp, n)
    scored = [True] * n
    c = int(collar / sd.FRAME)
    for s, e, _ in ref:
        for edge in (int(s / sd.FRAME), int(e / sd.FRAME)):
            for i in range(max(0, edge - c), min(n, edge + c)):
                scored[i] = False
    overlap = {}
    for i in range(n):
        if scored[i]:
            for r in rf[i]:
                for h in hf[i]:
                    overlap[(r, h)] = overlap.get((r, h), 0) + 1
    rs, hs = {k for _, _, k in ref}, {k for _, _, k in hyp}
    mp = sd.best_mapping(rs, hs, overlap)
    total = err = 0
    for i in range(n):
        if not scored[i]:
            continue
        r, h = rf[i], hf[i]
        correct = sum(1 for s in r if mp.get(s) in h)
        total += len(r)
        err += max(0, len(r) - len(h)) + max(0, len(h) - len(r)) + min(len(r), len(h)) - correct
    return {
        "ref": len(rs), "hyp": len(hs), "der": err / total,
        "extra": len(hs - set(mp.values())), "missed": len(rs - set(mp)),
    }


results = {}
for cfg in sorted(os.listdir(hyp_dir)):
    results[cfg] = {}
    for f in sorted(os.listdir(os.path.join(hyp_dir, cfg))):
        m = f[:-4]
        results[cfg][m] = score(m, os.path.join(hyp_dir, cfg, f))
json.dump(results, open(out, "w"), indent=1)
print("scored", len(results), "configs")
