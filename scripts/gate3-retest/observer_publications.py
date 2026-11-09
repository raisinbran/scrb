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
# The app (packages/transcription/src/livePass.ts labelFor) labels the microphone "You" and the meeting track
# "Speaker N", "Speaker ?" or, only when diarization is off or failed, "Meeting".
MEETING_LABEL = re.compile(r"^Speaker (\?|[1-9][0-9]*)$")


def track_for_label(name, labels):
    """The ONE place a row label becomes a track; None when the label is not recognised.

    Used by the publication conversion and by the scorer's regeneration (both call build_publications).
    An explicit mapping in `labels` wins; otherwise "Speaker ?" and "Speaker N" (any positive integer) are meeting.
    """
    if name in labels:
        return labels[name]
    return "meeting" if MEETING_LABEL.match(name) else None


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


def walk_rows(elements, labels):
    """Group a document-ordered element list into rows: label, time text, then paragraph elements.

    Returns (rows, unmapped). A row whose label is not recognised is returned in `unmapped`, never dropped silently.
    """
    rows, unmapped, current, previous = [], [], None, None
    for element in elements:
        name = (element.get("name") or "").strip()
        track = track_for_label(name, labels)
        if track is not None:
            current = {"label": name, "track": track, "time": None, "paragraphs": [], "label_element": element}
            rows.append(current)
        elif (TIME_TEXT.match(name) and (current is None or current["time"] is not None) and previous is not None
              and not TIME_TEXT.match((previous.get("name") or "").strip())):
            # A time stamp that opens a new row: the element just before it was the (unmapped) label.
            if current is not None and current["paragraphs"] and current["paragraphs"][-1] is previous:
                current["paragraphs"].pop()
            current = {"label": previous.get("name", "").strip(), "track": None, "time": name, "paragraphs": [],
                       "label_element": previous}
            unmapped.append(current)
        elif current is not None and current["time"] is None and TIME_TEXT.match(name):
            current["time"] = name
        elif current is not None and name and current["time"] is not None:
            current["paragraphs"].append(element)
        previous = element
    return rows, unmapped


def split_rows(elements, labels):
    return walk_rows(elements, labels)[0]


def unmapped_rows(sample, labels):
    """Rows with words whose label is not You, Meeting, Speaker ? or Speaker N: [(label, time, word count)]."""
    viewport = sample.get("viewport")
    return [(row["label"], row["time"], len(row_words(row, viewport)))
            for row in walk_rows(sample.get("elements", []), labels)[1] if row_words(row, viewport)]


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


def visible_before_dedup(sample, labels):
    """Count visible words in one sample BEFORE ambiguous-row deduplication or quarantine.

    Used for the first found sample: words that were already visible there make the run INCONCLUSIVE even
    when their rows are later quarantined or removed as same-time duplicates.
    """
    viewport = sample.get("viewport")
    return sum(1 for row in split_rows(sample.get("elements", []), labels) if row["time"]
               for word in row_words(row, viewport) if word["visible"])


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


def _prefix(key):
    return "|".join(key)


def tree_rows(sample, labels):
    """Rows present in the accessibility tree in one sample, visible or not.

    Returns {(track, time): {"texts": [...], "y": label top or None, "in_viewport": bool}}.
    Same-time duplicates within the sample are left out.
    """
    viewport = sample.get("viewport")
    rows = [row for row in split_rows(sample.get("elements", []), labels) if row["time"]]
    keys = [(row["track"], row["time"]) for row in rows]
    out = {}
    for row, key in zip(rows, keys):
        if keys.count(key) > 1:
            continue
        words = row_words(row, viewport)
        bounds = row["label_element"].get("bounds")
        out[key] = {"texts": [w["text"] for w in words], "y": bounds[1] if bounds else None,
                    "in_viewport": any(w["visible"] for w in words)}
    return out


def _gap_between(errors, previous_end, current_begin):
    return any(e["qpc_begin"] >= previous_end and e["qpc_end"] <= current_begin for e in errors)


def build_publications(header, samples, labels, harness_origin_qpc, expected_frequency, errors=None, markers=None):
    """Return (publication records, report) from parsed raw samples.

    Frequency must equal the harness log's. The observed time is the sample's end; u follows
    observation_u. Later changes of a position's text are reported, not published. A row key
    (track + displayed time) is QUARANTINED, permanently and with any earlier records removed,
    when it cannot be the same row everywhere it was seen: two such rows in one sample, or a
    return after absence (or after a read error) with different or shorter text. Quarantined
    rows get no publication, so their reference utterances stay uncredited in both bounds and
    in the denominator.
    """
    frequency = header["qpc_frequency"]
    if frequency != expected_frequency:
        raise ValueError("QPC frequency differs from the harness log; no conversion is defined")
    if not samples:
        raise ValueError("No samples")
    errors = header.get("errors", []) if errors is None else errors
    first, seen, revisions, quarantined, known, intervals = {}, {}, [], {}, {}, []
    spans = []
    ambiguous = set()
    previous_begin = header["origin_qpc"]
    last_end = None

    def quarantine(key, number, reason):
        if key in quarantined:
            return
        quarantined[key] = {"track": key[0], "time": key[1], "sample": number, "reason": reason}
        for identifier in [i for i in first if i.rsplit("|", 1)[0] == _prefix(key)]:
            del first[identifier]

    for number, sample in enumerate(samples):
        begin, end = sample["qpc_begin"], sample["qpc_end"]
        if end < begin or (last_end is not None and begin < last_end):
            raise ValueError("Samples must be chronological and non-overlapping")
        u_ticks = observation_u(previous_begin, end)
        intervals.append((number, u_ticks))
        spans.append((number, previous_begin, end))
        found, excluded = visible_words_in_sample(sample, labels)
        ambiguous.update(excluded)
        for key in excluded:
            quarantine(tuple(key), number, "rows with the same track and time seen together")
        rows = {}
        for word in found:
            rows.setdefault((word["track"], word["id"].split("|")[1]), []).append(word)
        contiguous = number > 0 and not _gap_between(errors, last_end, begin)
        for key, words in rows.items():
            if key in quarantined:
                continue
            texts = [w["text"] for w in words]
            old = known.get(key)
            if old is not None and not (contiguous and old["sample"] == number - 1):
                count = len(old["texts"])
                if len(texts) < count or texts[:count] != old["texts"]:
                    quarantine(key, number, "reappeared after absence or a read gap with different or shorter text")
                    continue
            known[key] = {"texts": texts, "sample": number}
            for word in words:
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
        previous_begin, last_end = begin, end
    trailing = max([e["qpc_end"] for e in errors if e["qpc_begin"] >= last_end], default=None)
    if trailing is not None:
        intervals.append((len(samples), observation_u(previous_begin, trailing)))
        spans.append((len(samples), previous_begin, trailing))
    records = list(first.values())  # insertion order is sample order, then document order
    gaps = [(samples[i]["qpc_begin"] - samples[i - 1]["qpc_end"]) / frequency for i in range(1, len(samples))]
    reads = [(s["qpc_end"] - s["qpc_begin"]) / frequency for s in samples] + \
            [(e["qpc_end"] - e["qpc_begin"]) / frequency for e in errors]
    # PROPOSED rule (owner approval pending): 250 ms is a REPORTING threshold, not a run-validity threshold.
    # Every publication keeps its measured u. The single interval before the first sample that found the
    # transcript viewport (observer start to that sample, widened by read errors) is reported as
    # pre_viewport_interval_s and left out of the all-interval statistics.
    pre_viewport_interval_s = intervals[0][1] / frequency
    first_sample_visible = visible_before_dedup(samples[0], labels)
    unmapped = [{"sample": n, "label": label, "time": time, "words": words}
                for n, s in enumerate(samples) for label, time, words in unmapped_rows(s, labels)]
    unmapped_counts = {}
    for item in unmapped:
        unmapped_counts[item["label"]] = unmapped_counts.get(item["label"], 0) + 1
    inconclusive = first_sample_visible > 0 or any(r["present_at_start"] for r in records) or bool(unmapped)
    result_status = "INCONCLUSIVE" if inconclusive else "OK"
    all_u = [(n, ticks / frequency) for n, ticks in intervals if n != 0]
    u_all_max = max((u for _, u in all_u), default=0.0)
    report = {"samples": len(samples), "publications": len(records),
              "u_max_s": max((r["u"] for r in records), default=None),
              "u_all_intervals_max_s": u_all_max, "u_all_intervals_count": len(all_u),
              "u_all_intervals_over_limit": [[n, u] for n, u in all_u if u > MAX_U_SECONDS],
              "u_limit_s": MAX_U_SECONDS, "u_pass": u_all_max <= MAX_U_SECONDS,
              "pre_viewport_interval_s": pre_viewport_interval_s,
              "result_status": result_status,
              "first_sample_visible_words_before_dedup": first_sample_visible,
              "validation_pass": bool(result_status == "OK"),
              "unmapped_label_row_count": len(unmapped), "unmapped_labels": unmapped_counts,
              "unmapped_label_rows": unmapped[:20],
              "u_limit_role": "reporting threshold only; u_pass and the statistics below never block scoring or validation_pass",
              "interval_statistics": interval_statistics(intervals, spans, records, samples, labels, frequency,
                                                         harness_origin_qpc, markers),
              "result_status_note": "INCONCLUSIVE when the first sample that found the viewport already holds visible words: "
                                    "the observer was started too late for this run. Counted before deduplication and quarantine, so quarantined or "
                                    "duplicate first-sample rows still count. A row with words under a label that is not You, Meeting, Speaker ? or Speaker N "
                                    "also makes the run INCONCLUSIVE (unmapped_labels lists the labels). validation_pass needs result_status OK; u above the 250 ms reporting threshold does not fail it. "
                                    "PROPOSED rule, not frozen.",
              "u_over_limit": [r["id"] for r in records if r["u"] > MAX_U_SECONDS and not r["present_at_start"]],
              "read_max_s": max(reads), "gap_max_s": max(gaps) if gaps else 0.0,
              "present_at_start": [r["id"] for r in records if r["present_at_start"]],
              "paragraph_bounds_only": sum(1 for r in records if r["bounds_source"] == "element"),
              "ambiguous_rows": [list(k) for k in sorted(ambiguous)],
              "quarantined_rows": sorted(quarantined.values(), key=lambda q: (q["sample"], q["track"], q["time"])),
              "credit_policy": "Quarantined rows are never credited in either bound; their reference utterances stay in the denominator.",
              "text_revisions": revisions, "error_samples": len(errors)}
    return records, report


def _nearest_rank(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, max(0, math.ceil(fraction * len(ordered)) - 1))] if ordered else None


def interval_phase(number, begin, end, motion, sample_count, frequency, harness_origin_qpc, markers):
    """Context of one observation interval, derived from the raw samples (and optional harness-second markers).

    Order: before viewport (the first sample), stop (the interval after the last sample), a marker whose time lies
    in the interval (e.g. recording, stop), scrolling (the sample or its predecessor shows pane motion), other.
    The raw file carries no recording or Stop marker, so those two appear only when supplied.
    """
    if number == 0:
        return "before viewport"
    if number == sample_count:
        return "stop"
    for name, seconds in (markers or {}).items():
        if begin <= harness_origin_qpc + seconds * frequency <= end:
            return name
    return "scrolling" if number in motion or number - 1 in motion else "other"


def interval_statistics(intervals, spans, records, samples, labels, frequency, harness_origin_qpc, markers, worst=5):
    """Descriptive statistics for the 250 ms reporting threshold; nothing here changes scoring.

    All intervals: every interval after the pre-viewport one, each equal to the u of the publications first seen
    in that sample (current successful sample end minus previous successful sample begin, so failed polls in
    between are inside it). First-observed scored words: the publications themselves, with the same u.
    """
    motion = set(virtualization_evidence(samples, labels)["pane_motion_samples"])
    phase = {n: interval_phase(n, b, e, motion, len(samples), frequency, harness_origin_qpc, markers)
             for n, b, e in spans}
    ticks = {n: u for n, u in intervals}

    def describe(rows):
        values = [u for _, u, _ in rows]
        over = [r for r in rows if r[1] > MAX_U_SECONDS]
        return {"count": len(rows), "max_s": max(values, default=None), "median_s": _nearest_rank(values, 0.5),
                "p90_s": _nearest_rank(values, 0.9), "p99_s": _nearest_rank(values, 0.99),
                "count_over_250ms": len(over),
                "worst": [{"sample": n, "u_s": u, "phase": ph}
                          for n, u, ph in sorted(rows, key=lambda r: -r[1])[:worst]]}
    all_rows = [(n, u / frequency, phase[n]) for n, u in intervals if n != 0]
    first_rows = [(r["sample_index"], r["u"], phase[r["sample_index"]]) for r in records if not r["present_at_start"]]
    phases = sorted({ph for _, _, ph in all_rows})
    return {"threshold_s": MAX_U_SECONDS, "all_intervals": describe(all_rows), "published_word_positions": describe(first_rows),
            "published_word_positions_note": "Word positions the observer published (first visible sample each, excluding words already on screen in the first sample); not necessarily scored words. Scored-word counts are in the scorer output observer_u_summary.",
            "over_250ms_by_phase": {ph: sum(1 for _, u, p in all_rows if p == ph and u > MAX_U_SECONDS) for ph in phases},
            "phases_note": "before viewport / stop / scrolling / other are derived from the raw samples; 'recording' "
                           "(or any other marker) appears only when its harness second is supplied with --phase-mark"}


def virtualization_evidence(samples, labels):
    """Derive from the samples whether rows really left the accessibility tree and came back.

    A row that is only scrolled out of the viewport stays in the tree and does not count. Evidence
    needs a row removed from the tree and later returned with consistent text (same identity), and
    rows moving on screen between consecutive samples. Nothing here is typed by a person.
    """
    tree = [tree_rows(s, labels) for s in samples]
    last_texts, removed_at, returns, motion, windows, never_returned = {}, {}, [], [], [], set()
    previous = {}
    for index, rows in enumerate(tree):
        for key in set(previous) - set(rows):
            removed_at[key] = index
            never_returned.add(key)
        for key, info in rows.items():
            if key in removed_at:
                old = last_texts[key]
                preserved = len(info["texts"]) >= len(old) and info["texts"][:len(old)] == old
                returns.append({"row": list(key), "removed_sample": removed_at[key], "returned_sample": index,
                                "identity_preserved": preserved})
                windows.append([removed_at.pop(key), index])
                never_returned.discard(key)
            last_texts[key] = info["texts"]
        if any(key in previous and info["y"] is not None and previous[key]["y"] is not None
               and abs(info["y"] - previous[key]["y"]) > 1 for key, info in rows.items()):
            motion.append(index)
        previous = rows
    outside = max((sum(1 for info in rows.values() if not info["in_viewport"]) for rows in tree), default=0)
    ok = bool(returns) and all(r["identity_preserved"] for r in returns) and bool(motion)
    return {"rows_returned_after_removal": len(returns), "returns": returns,
            "rows_removed_never_returned": sorted(list(k) for k in never_returned),
            "max_rows_in_tree_outside_viewport": outside, "pane_motion_samples": motion,
            "virtualized_windows": windows, "pass": ok}


def compare_review(samples, labels, review, frequency, harness_origin_qpc):
    """Compare the visibility rule with hand-read screen-recording frames.

    Each review item: {"t": harness seconds of a recording frame, "track": ..., "expected_visible": [words in order]}.
    Whether a frame falls in a scrolling stretch or a virtualized stretch is derived from the samples,
    not stated by the reviewer. The nearest earlier-or-equal sample is used; mismatches are listed.
    """
    evidence = virtualization_evidence(samples, labels)
    motion = set(evidence["pane_motion_samples"])
    ends = [(s["qpc_end"] - harness_origin_qpc) / frequency for s in samples]
    results, mismatches, scrolling, virtualized = [], [], 0, 0
    for item in review:
        candidates = [i for i, t in enumerate(ends) if t <= item["t"]]
        if not candidates:
            raise ValueError("Review time %s precedes every sample" % item["t"])
        index = candidates[-1]
        found, _ = visible_words_in_sample(samples[index], labels)
        got = [w["text"] for w in found if w["visible"] and w["track"] == item["track"]]
        ok = got == list(item["expected_visible"])
        scrolling += index in motion or index - 1 in motion
        virtualized += any(a <= index < b for a, b in evidence["virtualized_windows"])
        results.append({"t": item["t"], "sample": index, "ok": ok})
        if not ok:
            mismatches.append({"t": item["t"], "expected": item["expected_visible"], "observed": got})
    counts = {"total": len(review), "scrolling_derived": scrolling, "virtualized_derived": virtualized}
    enough = counts["total"] >= 10 and scrolling >= 1 and virtualized >= 1
    return {"counts": counts, "enough_samples": enough, "virtualization": evidence, "mismatches": mismatches,
            "pass": enough and evidence["pass"] and not mismatches}


def load_raw(path):
    """Read the JSONL; the first line must be the header. Error lines are counted, not used."""
    lines = [json.loads(line) for line in Path(path).read_text(encoding="utf-8-sig").splitlines() if line.strip()]
    if not lines or lines[0].get("type") != "header" or lines[0].get("schema") != RAW_SCHEMA:
        raise ValueError("Missing or wrong raw observer header")
    header = dict(lines[0])
    samples = [line for line in lines[1:] if line.get("type") == "sample"]
    header["errors"] = [line for line in lines[1:] if line.get("type") == "error"]
    header["error_samples"] = len(header["errors"])
    return header, samples


def main():
    """Write a new publication file and report; refuses to overwrite."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--harness-origin-qpc", type=int, required=True)
    parser.add_argument("--expected-frequency", type=int, required=True)
    parser.add_argument("--recording-sha256", required=True)
    parser.add_argument("--phase-mark", action="append", default=[], help="NAME=harness_seconds, repeatable (e.g. recording=30)")
    parser.add_argument("--label", action="append", default=[], help="LABEL=track, repeatable")
    args = parser.parse_args()
    labels = dict(item.split("=", 1) for item in args.label) if args.label else dict(DEFAULT_LABELS)
    if not re.fullmatch(r"[0-9a-f]{64}", args.recording_sha256):
        parser.error("recording sha256 must be 64 lowercase hex characters")
    header, samples = load_raw(args.raw)
    markers = {k: float(v) for k, v in (item.split("=", 1) for item in args.phase_mark)}
    records, report = build_publications(header, samples, labels, args.harness_origin_qpc, args.expected_frequency,
                                         markers=markers)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump({"schema": OUT_SCHEMA, "clock_basis": "harness", "recording_sha256": args.recording_sha256,
                   "harness_origin_qpc": args.harness_origin_qpc, "qpc_frequency": header["qpc_frequency"],
                   "words": records, "quarantined_rows": report["quarantined_rows"],
                   "credit_policy": report["credit_policy"], "report": report}, stream, indent=2)
        stream.write("\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
