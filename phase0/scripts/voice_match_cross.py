"""Voice-match confidence line across sessions (profile from one meeting, tests from later ones).

Usage: python -I voice_match_cross.py <LiveDiarize> <seg.onnx> <embed.onnx> <ami_dir>
       <out_dir> <series> [<series> ...]

A series is an AMI scenario series such as ES2004: four meetings (a-d) with the
same four people.  Speakers are identified across meetings by their AMI
global_name (corpusResources/meetings.xml), not by the per-meeting letter.

Single-speaker stretches are embedded as in voice_match.py.  Two enrolment
conditions are scored:

- "a -> b,c,d": each speaker's profile is the mean embedding of all their
  segments in meeting a; every segment of meetings b, c and d is a test;
- "a+b -> c,d": the profile also includes meeting b (a profile that has been
  updated once), and meetings c and d are tests.

Every test is scored against every profile from all series.  Error modes are
those of voice_match.py: known speaker named wrong (best profile above the
threshold but not theirs) and stranger named wrong (own profile withheld, any
profile above the threshold).  Rates are shares of all test segments.
"""

import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from score_der import load_reference  # noqa: E402
from voice_match import cos, mean, single_speaker_segments  # noqa: E402

THRESHOLDS = [round(0.40 + 0.05 * i, 2) for i in range(8)]


def speaker_map(ami, meeting):
    text = open(os.path.join(ami, "ann", "corpusResources", "meetings.xml"), encoding="utf-8").read()
    block = re.search(rf'observation="{meeting}".*?</meeting>', text, re.S).group(0)
    out = {}
    for tag in re.findall(r"<speaker [^>]*>", block):
        out[re.search(r'nxt_agent="(\w)"', tag).group(1)] = re.search(r'global_name="(\w+)"', tag).group(1)
    return out


def embed_meeting(exe, seg_model, emb_model, ami, out, meeting):
    """Return [(start, speaker_global_name, vector)] for the meeting's single-speaker stretches."""
    names = speaker_map(ami, meeting)
    segs = single_speaker_segments(load_reference(os.path.join(ami, "ann", "segments"), meeting))
    seg_file = os.path.join(out, f"{meeting}.segments.txt")
    with open(seg_file, "w") as f:
        for a, b, spk in segs:
            f.write(f"{a:.3f} {b:.3f} {meeting}-{spk}\n")
    emb_file = os.path.join(out, f"{meeting}.embeddings.txt")
    if not os.path.exists(emb_file):
        subprocess.run([exe, os.path.join(ami, f"{meeting}.Mix-Headset.wav"), emb_file,
                        seg_model, emb_model, "embed", seg_file], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    rows = []
    for line in open(emb_file):
        p = line.split()
        rows.append((float(p[0]), names[p[2].split("-")[1]], [float(x) for x in p[3:]]))
    return rows


def score(profiles, tests):
    """Per test (speaker, meeting, vector): (speaker, meeting, best profile, best score, best other score)."""
    scored = []
    for spk, meeting, v in tests:
        s = {p: cos(v, pv) for p, pv in profiles.items()}
        best = max(s, key=s.get)
        scored.append((spk, meeting, best, s[best], max(x for p, x in s.items() if p != spk)))
    return scored


def table(rows):
    n = len(rows)
    return [{"threshold": th,
             "known_auto_assigned": round(sum(b == s and sc >= th for s, _, b, sc, _ in rows) / n, 4),
             "known_wrong": round(sum(b != s and sc >= th for s, _, b, sc, _ in rows) / n, 4),
             "stranger_wrong": round(sum(o >= th for *_, o in rows) / n, 4)}
            for th in THRESHOLDS]


def breakdown(scored, key):
    """Threshold table per group (meeting letter or series)."""
    out = {}
    for g in sorted({key(x) for x in scored}):
        rows = [x for x in scored if key(x) == g]
        out[g] = {"tests": len(rows), "table": table(rows)}
    return out


def main():
    exe, seg_model, emb_model, ami, out = sys.argv[1:6]
    series = sys.argv[6:]
    os.makedirs(out, exist_ok=True)
    data = {}  # meeting -> rows
    for s in series:
        for letter in "abcd":
            data[s + letter] = embed_meeting(exe, seg_model, emb_model, ami, out, s + letter)

    result = {"series": series, "thresholds": THRESHOLDS, "conditions": {}}
    for cond, enrol, test in [("a -> b,c,d", "a", "bcd"), ("a+b -> c,d", "ab", "cd")]:
        by_spk = {}
        for s in series:
            for letter in enrol:
                for _, spk, v in data[s + letter]:
                    by_spk.setdefault(spk, []).append(v)
        profiles = {spk: mean(vs) for spk, vs in by_spk.items()}
        tests = [(spk, s + letter, v) for s in series for letter in test
                 for _, spk, v in data[s + letter] if spk in profiles]
        scored = score(profiles, tests)
        overall = table(scored)
        result["conditions"][cond] = {
            "profiles": len(profiles),
            "profile_segments": {spk: len(vs) for spk, vs in sorted(by_spk.items())},
            "test_segments": len(tests),
            "table": overall,
            "by_meeting_letter": breakdown(scored, lambda x: x[1][-1]),
            "by_series": breakdown(scored, lambda x: x[1][:-1]),
            "by_speaker": breakdown(scored, lambda x: x[0]),
            # Known-speaker mistakes at the lowest threshold in the table's useful range.
            "wrong_matches_at_0.50": [
                {"meeting": m, "speaker": spk, "named_as": b, "score": round(sc, 4),
                 "own_profile_score": round(cos(v, profiles[spk]), 4)}
                for (spk, m, b, sc, _), (_, _, v) in zip(scored, tests) if b != spk and sc >= 0.50],
            # Highest impostor score per test, to see how close strangers come.
            "stranger_max_score_quantiles": quantiles([x[4] for x in scored]),
            "own_profile_score_quantiles": quantiles(
                [cos(v, profiles[spk]) for spk, _, v in tests]),
        }
        print(f"{cond}: profiles={len(profiles)} tests={len(tests)}")
        print("threshold  known_auto  known_wrong  stranger_wrong")
        for r in overall:
            print(f"  {r['threshold']:.2f}     {r['known_auto_assigned']:.3f}      "
                  f"{r['known_wrong']:.3f}        {r['stranger_wrong']:.3f}")
    json.dump(result, open(os.path.join(out, "voice_match_cross.json"), "w"), indent=1)


def quantiles(xs):
    xs = sorted(xs)
    return {q: round(xs[min(len(xs) - 1, int(q * len(xs)))], 4) for q in (0.5, 0.9, 0.95, 0.98, 0.99)}


if __name__ == "__main__":
    main()
