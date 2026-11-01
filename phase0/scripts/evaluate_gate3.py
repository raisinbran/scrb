"""Score Gate 3 evidence snapshots without running models or claiming gate approval.

Usage: python phase0/scripts/evaluate_gate3.py /private/gate3/windows.json
"""

import argparse
import json
import math
import statistics
from pathlib import Path

from score_ami_wer import errors, normalize, reference


def load_json(path):
    """Read a JSON evidence file at the supplied path."""
    return json.loads(path.read_text(encoding="utf-8"))


def read_reference(clip, root):
    """Use a text reference or the Phase 0 AMI annotation reader."""
    if "reference" in clip:
        return normalize((root / clip["reference"]).read_text(encoding="utf-8"))
    ami = clip["ami"]
    return reference(str(root / ami["annotations"]), ami["meeting"])


def measure(value, label):
    """Reject missing, negative and nonfinite measurements, including booleans."""
    if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
        raise ValueError(f"{label} must be a nonnegative finite number")
    return value


def score_accuracy(clips, root):
    """Score paired raw live/final transcripts against each clip's one reference."""
    if not clips:
        return None
    rows = []
    seen = set()
    ref_total = live_total = final_total = 0
    live_present = True
    for clip in clips:
        name = clip["id"]
        if not isinstance(name, str) or not name or name in seen:
            raise ValueError("clip ids must be unique nonempty strings")
        seen.add(name)
        ref = read_reference(clip, root)
        if not ref:
            raise ValueError(f"{name}: reference has no scored words")
        live = normalize((root / clip["live"]).read_text(encoding="utf-8"))
        final = normalize((root / clip["final"]).read_text(encoding="utf-8"))
        live_errors = errors(ref, live)
        final_errors = errors(ref, final)
        ref_total += len(ref)
        live_total += live_errors
        final_total += final_errors
        live_present = live_present and bool(live)
        rows.append({
            "id": name,
            "reference_words": len(ref),
            "live_errors": live_errors,
            "final_errors": final_errors,
            "live_wer": round(live_errors / len(ref), 4),
            "final_wer": round(final_errors / len(ref), 4),
        })
    reduction = (live_total - final_total) / live_total if live_total else None
    return {
        "clips": rows,
        "reference_words": ref_total,
        "live_errors": live_total,
        "final_errors": final_total,
        "live_wer": round(live_total / ref_total, 4),
        "final_wer": round(final_total / ref_total, 4),
        "relative_error_reduction": round(reduction, 4) if reduction is not None else None,
        "meets_15_percent": (
            live_present and live_total > 0 and (live_total - final_total) * 100 >= 15 * live_total
        ),
    }


def score_delays(data):
    """Measure arrival after speech ends; use the empirical 95% within-six rule."""
    rows = data["rows"]
    if not rows:
        raise ValueError("live delay rows must not be empty")
    delays = sorted(measure(row["delay_s"], "delay_s") for row in rows)
    within = sum(delay <= 6 for delay in delays)
    median = statistics.median(delays)
    p95 = delays[math.ceil(0.95 * len(delays)) - 1]
    return {
        "segments": len(delays),
        "median_delay_s": round(median, 3),
        "p95_delay_s": round(p95, 3),
        "within_6s": within,
        "share_within_6s": round(within / len(delays), 4),
        "meets_delay_target": median <= 3 and within * 100 >= 95 * len(delays),
    }


def score_failures(data):
    """Summarize independently verified worker-kill observations, not inject faults."""
    cases = data["cases"]
    if not cases:
        raise ValueError("worker failure cases must not be empty")
    results = []
    for case in cases:
        restarts = case.get("restart_attempts")
        lost = case.get("saved_audio_lost_ms")
        good = (
            case.get("killed_during_audible_capture") is True
            and case.get("recording_continued") is True
            and type(lost) in (int, float) and math.isfinite(lost) and lost == 0
            and case.get("audio_continuity_verified") is True
            and case.get("live_lag_or_failure_visible") is True
            and type(restarts) is int and 0 <= restarts <= 3
        )
        results.append({"id": case["id"], "passes_worker_isolation": good})
    return {"cases": results, "all_pass": all(r["passes_worker_isolation"] for r in results)}


def evaluate(manifest, root):
    """Leave missing evidence unmeasured rather than marking an empty set passed."""
    if manifest.get("origin") not in ("synthetic", "production"):
        raise ValueError("origin must be 'synthetic' or 'production'")
    memory = manifest.get("peak_app_memory_mib")
    if memory is not None:
        memory = measure(memory, "peak_app_memory_mib")
    return {
        "origin": manifest["origin"],
        "scope": "scoring only; independent local evidence and Gate 3 QA still required",
        "accuracy": score_accuracy(manifest.get("clips", []), root),
        "live_delay": (
            score_delays(load_json(root / manifest["delay_file"]))
            if "delay_file" in manifest else None
        ),
        "worker_failure": (
            score_failures(load_json(root / manifest["worker_file"]))
            if "worker_file" in manifest else None
        ),
        "peak_app_memory_mib": memory,
    }


def main():
    """Print numeric measurements as JSON without copying transcript contents."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    try:
        report = evaluate(load_json(args.manifest), args.manifest.resolve().parent)
    except (AttributeError, KeyError, OverflowError, TypeError, ValueError, OSError) as exc:
        parser.error(str(exc))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
