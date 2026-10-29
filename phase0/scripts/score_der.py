"""Diarization error rate against AMI manual segment annotations.

Usage: python -I score_der.py <ami_segments_dir> <meeting_id> <hyp.txt> [collar_s]

Hypothesis lines are "<start> <end> <speaker>".  Scoring is frame based (10 ms),
counts overlapped speech, and excludes a collar around every reference boundary
(0.25 s default, the usual AMI convention).  Speakers are mapped one-to-one to
maximize matched time.  Also reports live-label stability: the share of each
reference speaker's matched time that carries a label other than that speaker's
dominant label (a proxy for how often live labels are wrong or renumbered).
"""

import glob
import itertools
import json
import os
import re
import sys

FRAME = 0.01


def load_reference(seg_dir, meeting):
    segments = []
    for path in glob.glob(os.path.join(seg_dir, f"{meeting}.*.segments.xml")):
        speaker = path.split(".")[-3]
        text = open(path, encoding="utf-8").read()
        for m in re.finditer(r'transcriber_start="([\d.]+)"\s+transcriber_end="([\d.]+)"', text):
            segments.append((float(m.group(1)), float(m.group(2)), speaker))
    return segments


def load_hypothesis(path):
    out = []
    for line in open(path, encoding="utf-8"):
        parts = line.split()
        if len(parts) == 3:
            out.append((float(parts[0]), float(parts[1]), parts[2]))
    return out


def to_frames(segments, n):
    frames = [set() for _ in range(n)]
    for start, end, spk in segments:
        for i in range(int(start / FRAME), min(n, int(end / FRAME))):
            frames[i].add(spk)
    return frames


def best_mapping(ref_spk, hyp_spk, overlap):
    """Injective ref->hyp mapping maximizing overlap; brute force for small sets."""
    hyp_list = sorted(hyp_spk)
    ref_list = sorted(ref_spk)
    best, best_map = -1, {}
    slots = hyp_list + [None] * len(ref_list)
    if len(hyp_list) > 9:
        # Greedy fallback for large hypothesis sets.
        pairs = sorted(((v, r, h) for (r, h), v in overlap.items()), reverse=True)
        used_r, used_h, mapping = set(), set(), {}
        for v, r, h in pairs:
            if r not in used_r and h not in used_h:
                mapping[r] = h
                used_r.add(r)
                used_h.add(h)
        return mapping
    for perm in itertools.permutations(slots, len(ref_list)):
        if any(p is not None and perm.count(p) > 1 for p in perm):
            continue
        total = sum(overlap.get((r, h), 0) for r, h in zip(ref_list, perm) if h is not None)
        if total > best:
            best, best_map = total, {r: h for r, h in zip(ref_list, perm) if h is not None}
    return best_map


def main():
    seg_dir, meeting, hyp_path = sys.argv[1:4]
    collar = float(sys.argv[4]) if len(sys.argv) > 4 else 0.25
    ref = load_reference(seg_dir, meeting)
    hyp = load_hypothesis(hyp_path)
    end = max([e for _, e, _ in ref] + [e for _, e, _ in hyp])
    n = int(end / FRAME) + 1
    ref_frames, hyp_frames = to_frames(ref, n), to_frames(hyp, n)
    scored = [True] * n
    c = int(collar / FRAME)
    for start, stop, _ in ref:
        for edge in (int(start / FRAME), int(stop / FRAME)):
            for i in range(max(0, edge - c), min(n, edge + c)):
                scored[i] = False

    overlap = {}
    for i in range(n):
        if not scored[i]:
            continue
        for r in ref_frames[i]:
            for h in hyp_frames[i]:
                overlap[(r, h)] = overlap.get((r, h), 0) + 1
    ref_spk = {s for _, _, s in ref}
    hyp_spk = {s for _, _, s in hyp}
    mapping = best_mapping(ref_spk, hyp_spk, overlap)

    total = miss = fa = conf = 0
    for i in range(n):
        if not scored[i]:
            continue
        r, h = ref_frames[i], hyp_frames[i]
        nr, nh = len(r), len(h)
        correct = sum(1 for s in r if mapping.get(s) in h)
        total += nr
        miss += max(0, nr - nh)
        fa += max(0, nh - nr)
        conf += min(nr, nh) - correct

    # Label stability: for frames with exactly one ref and one hyp speaker.
    per_ref = {}
    for i in range(n):
        if scored[i] and len(ref_frames[i]) == 1 and len(hyp_frames[i]) == 1:
            r = next(iter(ref_frames[i]))
            h = next(iter(hyp_frames[i]))
            per_ref.setdefault(r, {}).setdefault(h, 0)
            per_ref[r][h] += 1
    stable = sum(max(v.values()) for v in per_ref.values())
    single = sum(sum(v.values()) for v in per_ref.values())

    print(json.dumps({
        "meeting": meeting,
        "hypothesis": os.path.basename(hyp_path),
        "collar_s": collar,
        "ref_speakers": len(ref_spk),
        "hyp_speakers": len(hyp_spk),
        "der": round((miss + fa + conf) / total, 4),
        "miss": round(miss / total, 4),
        "false_alarm": round(fa / total, 4),
        "confusion": round(conf / total, 4),
        "label_instability": round(1 - stable / single, 4) if single else None,
    }))


if __name__ == "__main__":
    main()
