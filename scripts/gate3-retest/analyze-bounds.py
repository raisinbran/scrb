"""Compute protocol bounds from independently adjudicated publication endpoints."""
import argparse
import json
import math
from pathlib import Path
import statistics


def analyze_unit(unit):
    """Keep every eligible unit and reject pre-speech publication credit."""
    outcome = unit["outcome"]
    assert outcome in {"MATCHED", "MATCHED-SUBSTITUTED", "UNIDENTIFIED", "BOUNDED", "SETUP-AFFECTED"}
    if outcome == "UNIDENTIFIED":
        return {"id": unit["id"], "conservative": math.inf, "best": math.inf, "outcome": outcome}
    if outcome == "SETUP-AFFECTED":
        return {"id": unit["id"], "conservative": math.inf, "best": -math.inf, "outcome": outcome}
    assert unit.get("identity_confirmed") is True
    if outcome == "MATCHED-SUBSTITUTED":
        assert unit["reference_word_count"] >= 3 and unit["other_words_exact_fraction"] >= 0.6
        assert unit["identity_unique"] is True
    endpoints = unit["endpoints"]
    assert endpoints
    assert all(point["u"] >= 0 for point in endpoints)
    assert all(point["observed"] >= unit["last_word_start"] for point in endpoints), "PRE-SPEECH cannot receive credit"
    conservative = max(point["observed"] for point in endpoints)-unit["last_word_end"]
    best = min(point["observed"]-point["u"] for point in endpoints)-unit["last_word_end"]
    return {"id": unit["id"], "conservative": conservative, "best": best, "outcome": outcome,
            "straddle": conservative > 6 >= best}


def summarize_track(units):
    """Evaluate both bounds with uncredited units included in the denominator."""
    rows = [analyze_unit(unit) for unit in units if unit["eligible"]]
    assert rows, "No frozen eligible denominator"
    bounds = {}
    for name in ("conservative", "best"):
        values = [row[name] for row in rows]
        median = statistics.median(values)
        timely = sum(value <= 6 for value in values)
        bounds[name] = {"median": median, "within6": timely, "denominator": len(rows),
                        "pass": median <= 3 and timely/len(rows) >= 0.95}
    verdict = "PASS" if bounds["conservative"]["pass"] else "FAIL" if not bounds["best"]["pass"] else "INCONCLUSIVE"
    window_rows = [(unit, row) for unit, row in zip([u for u in units if u["eligible"]], rows)
                   if unit["start"] < 245 and unit["last_word_end"] > 170]
    recurrence = "FAILURE OBSERVED" if any(row["outcome"] == "UNIDENTIFIED" or row["best"] > 6 for _, row in window_rows) else (
        "INDETERMINATE" if any(row.get("straddle") or row["outcome"] in {"BOUNDED", "SETUP-AFFECTED"} for _, row in window_rows) else "NOT OBSERVED")
    return {"bounds": bounds, "latency": verdict, "recurrence": recurrence,
            "diagnosis": "INCONCLUSIVE; automatic event-chain localization not implemented",
            "units": rows}


def sanitize_numbers(value):
    """Serialize uncredited infinities explicitly instead of invalid JSON numbers."""
    if isinstance(value, float) and not math.isfinite(value):
        return "positive_infinity" if value > 0 else "negative_infinity"
    if isinstance(value, dict):
        return {key: sanitize_numbers(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_numbers(item) for item in value]
    return value


def fit_clock(lead_recorded, trail_recorded, lead_harness, trail_harness):
    """Fit marker clocks and expose offset change separately from the exact fit."""
    assert trail_recorded > lead_recorded and trail_harness > lead_harness
    slope = (trail_harness-lead_harness)/(trail_recorded-lead_recorded)
    offset = lead_harness-slope*lead_recorded
    discrepancy = abs((trail_harness-trail_recorded)-(lead_harness-lead_recorded))
    return {"offset": offset, "slope": slope, "offset_disagreement_seconds": discrepancy,
            "valid": discrepancy <= 0.1, "marker_detection": "external independent input required"}


def main():
    """Analyze adjudicated units only after their frozen identity evidence is supplied."""
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8-sig"))
    assert data["frozen"] is True, "Unfrozen annotations cannot be scored"
    result = {track: summarize_track([unit for unit in data["units"] if unit["track"] == track])
              for track in ("microphone", "meeting")}
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(sanitize_numbers(result), stream, indent=2, allow_nan=False)
        stream.write("\n")


if __name__ == "__main__":
    main()
