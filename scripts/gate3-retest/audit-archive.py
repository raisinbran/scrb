"""Inspect historical timing metadata without opening owner audio or transcript text."""
import argparse
import json
from pathlib import Path
import statistics


def read_json(path):
    """Read one explicitly allowlisted metadata file."""
    return json.loads(path.read_text(encoding="utf-8-sig"))


def fit_anchors(rows):
    """Estimate a bracketed QPC-to-wall offset without claiming audio alignment."""
    row = min(rows, key=lambda item: item["afterNs"]-item["beforeNs"])
    midpoint = (row["beforeNs"]+row["afterNs"])/2e6
    return {"wall_minus_qpc_ms": row["unixMs"]-midpoint,
            "bracket_ms": (row["afterNs"]-row["beforeNs"])/2e6+1000/row["frequency"]}


def audit_archive(source):
    """Summarize detector counts and clock metadata while preserving frozen scoring."""
    units = read_json(source / "eligible.json")
    meeting = [unit for unit in units if unit["track"] == "meeting"]
    before = fit_anchors(read_json(source / "qpc-before.json"))
    after = fit_anchors(read_json(source / "qpc-after.json"))
    native = read_json(source / "native.json")
    assert len(native["acks"]) == 1
    ack = native["acks"][0]
    config = read_json(source / "configuration.json")
    memory = [json.loads(line) for line in (source / "memory.jsonl").read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    return {"purpose": "metadata preflight only; not a rescore", "frozen_result": "73/77 unchanged",
            "original_clock": "native recording origin; measure.py clips first 240000 native ms",
            "meeting_detector_count": len(meeting),
            "meeting_short_under_1s": sum(unit["endMs"]-unit["startMs"] < 1000 for unit in meeting),
            "clock_before": before, "clock_after": after,
            "offset_change_ms": after["wall_minus_qpc_ms"]-before["wall_minus_qpc_ms"],
            "native_origin_qpc_ns": ack["clockOriginNs"],
            "original_live_settings": config["live"]["whisper"],
            "memory_samples": len(memory),
            "original_app_memory_peak_bytes": max(row["totalBytes"] for row in memory),
            "original_app_memory_median_bytes": statistics.median(row["totalBytes"] for row in memory),
            "not_verified": ["audio sync markers", "original simultaneous speech fraction", "prior GPU/CPU utilization",
                             "background app equivalence", "virtual route equivalence"]}


def main():
    """Write a new sanitized metadata audit without altering the archive."""
    parser = argparse.ArgumentParser()
    parser.add_argument("archive_session", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = audit_archive(args.archive_session)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2)
        stream.write("\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
