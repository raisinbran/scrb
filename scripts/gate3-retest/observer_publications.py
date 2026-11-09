"""Turn raw Live-screen observer samples into the publication file read by occurrence_matcher.py.

Offline and read-only: it never starts the app. Input is the JSONL written by observe-live-v2.ps1.
A word counts as visible in a sample only when its bounds lie fully inside the transcript viewport
read in that same sample and the element is not reported off screen. Each word position keeps the
first sample in which it was visible. Times are seconds on the harness QPC clock.
"""
import argparse
import json
import math
import re
from pathlib import Path

RAW_SCHEMA = "SRCB-G3-OBSERVER-RAW-1"
OUT_SCHEMA = "SRCB-G3-OBSERVER-PUBLICATIONS-1"
DEFAULT_LABELS = {"You": "microphone", "Meeting": "meeting"}
MAX_U_SECONDS = 0.25
TIME_TEXT = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


def inside(bounds, viewport):
    """True when a non-empty rectangle [x, y, width, height] lies fully inside the viewport."""
    if bounds is None or viewport is None:
        return False
    x, y, w, h = bounds
    vx, vy, vw, vh = viewport
    if not all(math.isfinite(v) for v in (x, y, w, h, vx, vy, vw, vh)) or w <= 0 or h <= 0 or vw <= 0 or vh <= 0:
        return False
    return x >= vx and y >= vy and x + w <= vx + vw and y + h <= vy + vh


def observation_u(previous_begin, current_end):
    """Upper bound on how long before current_end the text can have become visible.

    The text was absent when the previous sample began reading and present when this one finished,
    so the interval is the gap between samples plus both read times. All values are QPC ticks.
    """
    if current_end < previous_begin:
        raise ValueError("Sample ends before the previous sample began")
    return current_end - previous_begin


def split_rows(elements, labels):
    """Group a document-ordered element list into rows: label, time text, then paragraph elements."""
    rows, current = [], None
    for element in elements:
        name = (element.get("name") or "").strip()
        if name in labels:
            current = {"label": name, "track": labels[name], "time": None, "paragraphs": [], "label_element": element}
            rows.append(current)
        elif current is not None and current["time"] is None and TIME_TEXT.match(name):
            current["time"] = name
        elif current is not None and current["paragraphs"] and TIME_TEXT.match(name):
            # A time stamp after paragraphs opens a row whose label is not mapped: drop it and its label.
            current["paragraphs"].pop()
            current = None
        elif current is not None and name and current["time"] is not None:
            current["paragraphs"].append(element)
    return rows


def row_words(row, viewport):
    """Words of a row in order, each with the bounds used for the visibility test."""
    out = []
    for element in row["paragraphs"]:
        listed = element.get("words")
        if listed:
            for word in listed:
                out.append({"text": word["text"], "bounds": word.get("bounds"), "source": "word",
                            "visible": (not element.get("offscreen")) and inside(word.get("bounds"), viewport)})
        else:
            for text in (element.get("name") or "").split():
                out.append({"text": text, "bounds": element.get("bounds"), "source": "element",
                            "visible": (not element.get("offscreen")) and inside(element.get("bounds"), viewport)})
    return out


def visible_words_in_sample(sample, labels):
    """All visible word positions of one sample, as (id, track, text, source) in document order.

    Rows that share a track and time text within the same sample are ambiguous: their words are
    excluded and the pair reported, because the id cannot tell them apart.
    """
    viewport = sample.get("viewport")
    rows = [row for row in split_rows(sample.get("elements", []), labels) if row["time"]]
    keys = [(row["track"], row["time"]) for row in rows]
    ambiguous = {key for key in keys if keys.count(key) > 1}
    found, excluded = [], sorted(ambiguous)
    for row in rows:
        key = (row["track"], row["time"])
        if key in ambiguous:
            continue
        for index, word in enumerate(row_words(row, viewport)):
            found.append({"id": "%s|%s|%d" % (row["track"], row["time"], index), "track": row["track"],
                          "text": word["text"], "source": word["source"], "visible": word["visible"]})
    return found, excluded


def build_publications(header, samples, labels, harness_origin_qpc, expected_frequency):
    """Return (publication records, report) from parsed raw samples.

    Frequency must equal the harness log's. The observed time is the sample's end; u follows
    observation_u. Later changes of a position's text are reported, not published.
    """
    frequency = header["qpc_frequency"]
    if frequency != expected_frequency:
        raise ValueError("QPC frequency differs from the harness log; no conversion is defined")
    if not samples:
        raise ValueError("No samples")
    first, seen, revisions, ambiguous, rows_seen, u_values = {}, {}, [], set(), {}, []
    previous_begin = header["origin_qpc"]
    last_end = None
    for number, sample in enumerate(samples):
        begin, end = sample["qpc_begin"], sample["qpc_end"]
        if end < begin or (last_end is not None and begin < last_end):
            raise ValueError("Samples must be chronological and non-overlapping")
        u_ticks = observation_u(previous_begin, end)
        found, excluded = visible_words_in_sample(sample, labels)
        ambiguous.update(excluded)
        for word in found:
            if word["id"] in seen and seen[word["id"]] != word["text"] and word["visible"]:
                revisions.append({"id": word["id"], "from": seen[word["id"]], "to": word["text"], "sample": number})
            if not word["visible"]:
                continue
            seen.setdefault(word["id"], word["text"])
            if word["id"] not in first:
                first[word["id"]] = {"id": word["id"], "track": word["track"], "text": word["text"],
                                     "observed": (end - harness_origin_qpc) / frequency,
                                     "u": u_ticks / frequency, "sample_index": number,
                                     "bounds_source": word["source"], "present_at_start": number == 0}
                u_values.append(u_ticks / frequency)
        previous_begin, last_end = begin, end
    records = list(first.values())  # insertion order is sample order, then document order
    gaps = [(samples[i]["qpc_begin"] - samples[i - 1]["qpc_end"]) / frequency for i in range(1, len(samples))]
    reads = [(s["qpc_end"] - s["qpc_begin"]) / frequency for s in samples]
    report = {"samples": len(samples), "publications": len(records),
              "u_max_s": max(u_values) if u_values else None,
              "u_over_limit": [r["id"] for r in records if r["u"] > MAX_U_SECONDS and not r["present_at_start"]],
              "read_max_s": max(reads), "gap_max_s": max(gaps) if gaps else 0.0,
              "present_at_start": [r["id"] for r in records if r["present_at_start"]],
              "paragraph_bounds_only": sum(1 for r in records if r["bounds_source"] == "element"),
              "ambiguous_rows": [list(k) for k in sorted(ambiguous)], "text_revisions": revisions,
              "error_samples": header.get("error_samples", 0)}
    return records, report


def compare_review(samples, labels, review, frequency, harness_origin_qpc):
    """Compare the visibility rule with hand-read screen-recording samples.

    Each review item: {"t": harness seconds of a recording frame, "expected_visible": [words in order],
    "scrolling": bool, "virtualized_older_lines": bool, "track": "microphone"|"meeting"}.
    The nearest earlier-or-equal sample is used; mismatches are listed, not silently dropped.
    """
    ends = [(s["qpc_end"] - harness_origin_qpc) / frequency for s in samples]
    results, mismatches = [], []
    for item in review:
        candidates = [i for i, t in enumerate(ends) if t <= item["t"]]
        if not candidates:
            raise ValueError("Review time %s precedes every sample" % item["t"])
        index = candidates[-1]
        found, _ = visible_words_in_sample(samples[index], labels)
        got = [w["text"] for w in found if w["visible"] and w["track"] == item["track"]]
        ok = got == list(item["expected_visible"])
        results.append({"t": item["t"], "sample": index, "ok": ok})
        if not ok:
            mismatches.append({"t": item["t"], "expected": item["expected_visible"], "observed": got})
    counts = {"total": len(review), "scrolling": sum(1 for i in review if i.get("scrolling")),
              "virtualized": sum(1 for i in review if i.get("virtualized_older_lines"))}
    enough = counts["total"] >= 10 and counts["scrolling"] >= 1 and counts["virtualized"] >= 1
    return {"counts": counts, "enough_samples": enough, "mismatches": mismatches,
            "pass": enough and not mismatches}


def load_raw(path):
    """Read the JSONL; the first line must be the header. Error lines are counted, not used."""
    lines = [json.loads(line) for line in Path(path).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if not lines or lines[0].get("type") != "header" or lines[0].get("schema") != RAW_SCHEMA:
        raise ValueError("Missing or wrong raw observer header")
    header = dict(lines[0])
    samples = [line for line in lines[1:] if line.get("type") == "sample"]
    header["error_samples"] = sum(1 for line in lines[1:] if line.get("type") == "error")
    return header, samples


def main():
    """Write a new publication file and report; refuses to overwrite."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--harness-origin-qpc", type=int, required=True)
    parser.add_argument("--expected-frequency", type=int, required=True)
    parser.add_argument("--recording-sha256", required=True)
    parser.add_argument("--label", action="append", default=[], help="LABEL=track, repeatable")
    args = parser.parse_args()
    labels = dict(item.split("=", 1) for item in args.label) if args.label else dict(DEFAULT_LABELS)
    if not re.fullmatch(r"[0-9a-f]{64}", args.recording_sha256):
        parser.error("recording sha256 must be 64 lowercase hex characters")
    header, samples = load_raw(args.raw)
    records, report = build_publications(header, samples, labels, args.harness_origin_qpc, args.expected_frequency)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump({"schema": OUT_SCHEMA, "clock_basis": "harness", "recording_sha256": args.recording_sha256,
                   "words": records, "report": report}, stream, indent=2)
        stream.write("\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
