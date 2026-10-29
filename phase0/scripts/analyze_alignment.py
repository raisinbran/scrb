"""Compare sample-count alignment with chunk-timestamp alignment for a DualCapture run.

Usage: python -I analyze_alignment.py <prefix>-timing.csv [chunk_seconds]

Each timing row gives a packet's device QPC time and the number of frames
written before it.  Sample-count alignment places frame n at n / 48000 s after
the track's first frame.  Chunk-timestamp alignment places each chunk at the
QPC time of its first frame and plays it at the nominal rate inside the chunk,
which is what a recorder storing a start timestamp per chunk can do.  For both,
the error at every logged packet is placed time minus true QPC time, and the
mic-minus-app difference of those errors is the sync drift a listener hears.
"""

import bisect
import csv
import json
import sys

RATE = 48000


def load(path):
    tracks = {"app": [], "mic": []}
    for row in csv.DictReader(open(path)):
        # macOS probe rows carry the track's device rate; Windows rows are 48 kHz.
        rate = float(row.get("rate") or RATE)
        frames = int(row["frames_before_packet"]) * RATE / rate
        tracks[row["track"]].append((frames, float(row["qpc_s"])))
    return tracks


def sample_count_errors(points):
    f0, q0 = points[0]
    return [(q, (f - f0) / RATE - (q - q0)) for f, q in points]


def chunk_errors(points, chunk_seconds):
    """Anchor = the logged packet nearest each chunk boundary (rows are ~1 s apart)."""
    f0, q0 = points[0]
    anchors = [points[0]]
    for f, q in points[1:]:
        if (f - anchors[-1][0]) / RATE >= chunk_seconds:
            anchors.append((f, q))
    frames = [a[0] for a in anchors]
    out = []
    for f, q in points:
        a = anchors[bisect.bisect_right(frames, f) - 1]
        placed = (a[1] - q0) + (f - a[0]) / RATE
        out.append((q, placed - (q - q0)))
    return out


def relative(app, mic):
    """Mic error minus app error, pairing each mic row with the nearest-time app row."""
    app_times = [t for t, _ in app]
    diffs = []
    for t, e in mic:
        i = min(max(bisect.bisect_left(app_times, t), 0), len(app) - 1)
        diffs.append((t, e - app[i][1]))
    return diffs


def main():
    path = sys.argv[1]
    chunk = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
    tracks = load(path)
    t0 = tracks["app"][0][1]
    result = {}
    for name, fn in (("sample_count", sample_count_errors),
                     ("chunk_timestamps", lambda p: chunk_errors(p, chunk))):
        rel = relative(fn(tracks["app"]), fn(tracks["mic"]))
        worst = max(rel, key=lambda x: abs(x[1]))
        result[name] = {
            "max_abs_ms": round(abs(worst[1]) * 1000, 3),
            "at_s": round(worst[0] - t0, 1),
            "final_ms": round(rel[-1][1] * 1000, 3),
        }
    span = tracks["app"][-1][1] - t0
    rel = relative(sample_count_errors(tracks["app"]), sample_count_errors(tracks["mic"]))
    slope_ppm = (rel[-1][1] - rel[0][1]) / span * 1e6
    result["relative_clock_ppm"] = round(slope_ppm, 3)
    result["projected_8h_sample_count_ms"] = round(abs(slope_ppm) * 1e-6 * 8 * 3600 * 1000, 1)
    result["span_s"] = round(span, 1)
    result["chunk_seconds"] = chunk
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
