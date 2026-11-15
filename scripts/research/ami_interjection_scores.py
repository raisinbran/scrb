"""Interjections in AMI reference annotations, and how well a hypothesis labels them.

Usage: python -I ami_interjection_scores.py <ami_segments_dir> <hyp_dir> <seconds> <out.json> [--list] [meeting ...]
Meetings: the ones named after the options, else every <meeting>.txt in <hyp_dir>, else (with --list and no
hypotheses) every meeting that has reference segments in <ami_segments_dir>.
Step 1 (--list, no hypothesis needed): count interjections per length bucket, overlapped or not.
Step 3: for each interjection, the fraction of its duration (whole 10 ms frames, no collar; the same frames
count in numerator and denominator) in which the hypothesis carries the final speaker mapped to the true
speaker, by bucket.

Interjection: a reference segment S by speaker B, shorter than 4 s, whose span lies inside (or touches,
within 0.25 s) another speaker's talk run. A speaker's talk run = that speaker's reference segments merged
across gaps of 1.0 s or less; every other speaker whose run contains S is a surrounding speaker. Overlapped =
at least one frame of S has reference speech from any other speaker; otherwise S sits in a pause of everyone
else. Buckets by length: under 0.5 s, 0.5-1, 1-2, 2-4 s. Speaker mapping is the best one-to-one mapping over
the whole clipped clip (scripts/eval/score_der.py logic, 0.25 s scoring collar).
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


def frame_range(s, e):
    return range(int(s / sd.FRAME), max(int(s / sd.FRAME), int(e / sd.FRAME)))


def interjections(ref):
    """(start, end, speaker, surrounding speakers, overlapped) for every interjection, in reference order."""
    speakers = sorted({k for _, _, k in ref})
    n = int(max([e for _, e, _ in ref] + [0.0]) / sd.FRAME) + 2
    rf = sd.to_frames(ref, n)
    found = []
    for s, e, b in ref:
        length = e - s
        if length >= 4.0 or length <= 0:
            continue
        around = [
            a for a in speakers
            if a != b and any(rs - TOUCH <= s and e <= re_ + TOUCH for rs, re_ in runs(ref, a))
        ]
        if not around:
            continue
        overlapped = any(rf[i] - {b} for i in frame_range(s, e))
        found.append((s, e, b, around, overlapped))
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


def empty_table():
    return {
        f"{name}|{'overlapped' if ov else 'not overlapped'}": {"count": 0, "seconds": 0.0, "correct_seconds": 0.0}
        for name, _, _ in BUCKETS
        for ov in (True, False)
    }


def tabulate(items, mp=None, hf=None):
    """Per bucket and overlap: count, frame seconds, and frame seconds carrying the mapped true speaker.
    The numerator and the denominator count the same whole frames, so a fraction never exceeds 1."""
    table = empty_table()
    for s, e, b, _around, ov in items:
        cell = table[f"{bucket(e - s)}|{'overlapped' if ov else 'not overlapped'}"]
        frames = frame_range(s, e)
        cell["count"] += 1
        cell["seconds"] += len(frames) * sd.FRAME
        if mp is not None:
            cell["correct_seconds"] += sum(1 for i in frames if mp.get(b) in hf[i]) * sd.FRAME
    return table


def meetings_to_process(seg_dir, hyp_dir, listing, named):
    if named:
        return sorted(named)
    hyps = sorted(f[:-4] for f in os.listdir(hyp_dir) if f.endswith(".txt")) if os.path.isdir(hyp_dir) else []
    if hyps:
        return hyps
    if listing:
        return sorted({f.split(".")[0] for f in os.listdir(seg_dir) if f.endswith(".segments.xml")})
    return []


def main():
    args = [a for a in sys.argv[1:] if a != "--list"]
    seg_dir, hyp_dir, seconds, out = args[0], args[1], float(args[2]), args[3]
    listing = "--list" in sys.argv
    meetings = meetings_to_process(seg_dir, hyp_dir, listing, args[4:])
    if not meetings:
        sys.exit("no meetings to process: give hypotheses in <hyp_dir>, name meetings, or use --list")
    results = {}
    for meeting in meetings:
        ref = clip(sd.load_reference(seg_dir, meeting), seconds)
        items = interjections(ref)
        if listing:
            results[meeting] = tabulate(items)
        else:
            hyp = clip(sd.load_hypothesis(os.path.join(hyp_dir, meeting + ".txt")), seconds)
            mp, hf = mapping_for(ref, hyp, seconds)
            results[meeting] = tabulate(items, mp, hf)
    json.dump(results, open(out, "w"), indent=1)
    print("wrote", out, "for", len(results), "meetings")


if __name__ == "__main__":
    main()
