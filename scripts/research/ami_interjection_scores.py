"""Interjections in AMI reference annotations, and how well a hypothesis labels them.

Usage: python -I ami_interjection_scores.py <ami_segments_dir> <hyp_dir> <seconds> <out.json> [--list]
Step 1 (--list, no hypothesis needed): count interjections per length bucket, overlapped or not.
Step 3: for each interjection, the fraction of its duration (10 ms frames, no collar) in which the
hypothesis carries the final speaker mapped to the true speaker, by bucket.

Interjection: a reference segment S by speaker B, shorter than 4 s, whose span lies inside (or touches,
within 0.25 s) another speaker A's talk run. A's talk run = A's reference segments merged across gaps of
1.0 s or less. Overlapped = A has reference speech on at least one frame of S; otherwise S sits in a
pause of A's run. Buckets by length: under 0.5 s, 0.5-1, 1-2, 2-4 s. Speaker mapping is the best
one-to-one mapping over the whole clipped clip (scripts/eval/score_der.py logic, 0.25 s scoring collar).
"""
import importlib.util
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("score_der", os.path.join(here, "..", "eval", "score_der.py"))
sd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sd)

BUCKETS = [("<0.5 s", 0.0, 0.5), ("0.5-1 s", 0.5, 1.0), ("1-2 s", 1.0, 2.0), ("2-4 s", 2.0, 4.0)]
TOUCH, MERGE_GAP = 0.25, 1.0


def clip(segs, seconds):
    return [(s, min(e, seconds), k) for s, e, k in segs if s < seconds]


def runs(segs, speaker):
    mine = sorted((s, e) for s, e, k in segs if k == speaker)
    out = []
    for s, e in mine:
        if out and s - out[-1][1] <= MERGE_GAP:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def interjections(ref):
    speakers = sorted({k for _, _, k in ref})
    found = []
    for s, e, b in ref:
        length = e - s
        if length >= 4.0 or length <= 0:
            continue
        for a in speakers:
            if a == b:
                continue
            if any(rs - TOUCH <= s and e <= re_ + TOUCH for rs, re_ in runs(ref, a)):
                overlapped = any(as_ < e and s < ae for as_, ae, k in ref if k == a)
                found.append((s, e, b, a, overlapped))
                break
    return found


def bucket(length):
    for name, lo, hi in BUCKETS:
        if lo <= length < hi:
            return name
    return None


def mapping_for(ref, hyp, seconds):
    n = int(seconds / sd.FRAME) + 1
    rf, hf = sd.to_frames(ref, n), sd.to_frames(hyp, n)
    scored = [True] * n
    c = int(0.25 / sd.FRAME)
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
    return sd.best_mapping({k for _, _, k in ref}, {k for _, _, k in hyp}, overlap), hf


def main():
    seg_dir, hyp_dir, seconds, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
    listing = "--list" in sys.argv
    results = {}
    meetings = sorted(f[:-4] for f in os.listdir(hyp_dir) if f.endswith(".txt")) if not listing else sorted(
        {os.path.basename(p).split(".")[0] for p in os.listdir(seg_dir) if p.endswith(".segments.xml")} & set(sys.argv[5:])
    )
    for meeting in meetings:
        ref = clip(sd.load_reference(seg_dir, meeting), seconds)
        items = interjections(ref)
        table = {f"{name}|{'overlapped' if ov else 'not overlapped'}": {"count": 0, "seconds": 0.0, "correct_seconds": 0.0}
                 for name, _, _ in BUCKETS for ov in (True, False)}
        if not listing:
            hyp = clip(sd.load_hypothesis(os.path.join(hyp_dir, meeting + ".txt")), seconds)
            mp, hf = mapping_for(ref, hyp, seconds)
        for s, e, b, a, ov in items:
            cell = table[f"{bucket(e - s)}|{'overlapped' if ov else 'not overlapped'}"]
            cell["count"] += 1
            cell["seconds"] += e - s
            if not listing:
                frames = range(int(s / sd.FRAME), int(e / sd.FRAME))
                hit = sum(1 for i in frames if mp.get(b) in hf[i])
                cell["correct_seconds"] += hit * sd.FRAME
        results[meeting] = table
    json.dump(results, open(out, "w"), indent=1)
    print("wrote", out, "for", len(results), "meetings")


main()
