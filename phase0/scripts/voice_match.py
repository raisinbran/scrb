"""Provisional voice-match confidence line from AMI reference speaker segments.

Usage: python -I voice_match.py <LiveDiarize.exe> <seg.onnx> <embed.onnx> <ami_dir>
       <out_dir> <meeting> [<meeting> ...]

For each meeting, single-speaker stretches of at least 1.5 s (no overlap with
another reference speaker) are embedded.  Each speaker's profile is the mean
embedding of the first half of their segments (by time); the second half are
test segments.  Every test segment is scored against every profile from all
meetings.  Two error modes are measured per threshold:

- known speaker: the best-scoring profile is above the threshold but wrong;
- stranger: the speaker's own profile is withheld (someone the app has never
  heard), and any profile above the threshold counts as a wrong match.

Profiles and tests come from the same meeting, which is easier than matching
across meetings, so the resulting line is optimistic and provisional.
"""

import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from score_der import load_reference  # noqa: E402


def single_speaker_segments(ref, min_len=1.5):
    """Split reference segments into stretches where only one speaker talks."""
    edges = sorted({t for s, e, _ in ref for t in (s, e)})
    out = []
    for a, b in zip(edges, edges[1:]):
        if b - a <= 0:
            continue
        active = [spk for s, e, spk in ref if s <= a and e >= b]
        if len(active) == 1:
            if out and out[-1][2] == active[0] and abs(out[-1][1] - a) < 1e-6:
                out[-1] = (out[-1][0], b, active[0])
            else:
                out.append((a, b, active[0]))
    return [s for s in out if s[1] - s[0] >= min_len]


def mean(vectors):
    v = [sum(x) / len(vectors) for x in zip(*vectors)]
    n = math.sqrt(sum(x * x for x in v))
    return [x / n for x in v]


def cos(a, b):
    return sum(x * y for x, y in zip(a, b))


def main():
    exe, seg_model, emb_model, ami, out = sys.argv[1:6]
    meetings = sys.argv[6:]
    os.makedirs(out, exist_ok=True)
    profiles, tests = {}, []
    for meeting in meetings:
        ref = load_reference(os.path.join(ami, "ann", "segments"), meeting)
        segs = single_speaker_segments(ref)
        seg_file = os.path.join(out, f"{meeting}.segments.txt")
        with open(seg_file, "w") as f:
            for a, b, spk in segs:
                f.write(f"{a:.3f} {b:.3f} {meeting}-{spk}\n")
        emb_file = os.path.join(out, f"{meeting}.embeddings.txt")
        if not os.path.exists(emb_file):
            subprocess.run([exe, os.path.join(ami, f"{meeting}.Mix-Headset.wav"), emb_file,
                            seg_model, emb_model, "embed", seg_file], check=True,
                           stderr=subprocess.DEVNULL)
        by_spk = {}
        for line in open(emb_file):
            p = line.split()
            by_spk.setdefault(p[2], []).append((float(p[0]), [float(x) for x in p[3:]]))
        for spk, rows in by_spk.items():
            rows.sort()
            half = len(rows) // 2
            if half < 2:
                continue
            profiles[spk] = mean([v for _, v in rows[:half]])
            tests += [(spk, v) for _, v in rows[half:]]

    thresholds = [round(0.30 + 0.05 * i, 2) for i in range(12)]
    table = []
    for th in thresholds:
        known_wrong = known_right = stranger_wrong = 0
        for spk, v in tests:
            scores = {p: cos(v, pv) for p, pv in profiles.items()}
            best = max(scores, key=scores.get)
            if scores[best] >= th:
                known_right += best == spk
                known_wrong += best != spk
            others = {p: s for p, s in scores.items() if p != spk}
            if max(others.values()) >= th:
                stranger_wrong += 1
        n = len(tests)
        table.append({"threshold": th, "known_auto_assigned": round(known_right / n, 4),
                      "known_wrong": round(known_wrong / n, 4),
                      "stranger_wrong": round(stranger_wrong / n, 4)})
    result = {"meetings": meetings, "profiles": len(profiles), "test_segments": len(tests),
              "table": table}
    json.dump(result, open(os.path.join(out, "voice_match.json"), "w"), indent=1)
    print(f"profiles={len(profiles)} tests={len(tests)}")
    print("threshold  known_auto  known_wrong  stranger_wrong")
    for r in table:
        print(f"  {r['threshold']:.2f}     {r['known_auto_assigned']:.3f}      "
              f"{r['known_wrong']:.3f}        {r['stranger_wrong']:.3f}")


if __name__ == "__main__":
    main()
