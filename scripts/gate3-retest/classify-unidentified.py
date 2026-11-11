"""DRAFT diagnostic, offline: classify every UNIDENTIFIED unit of an observer run by cause, from retained raw samples.

Reads the raw observer file, the converted publication files (one per track), the DRAFT annotations and the action log;
writes one JSON file. Scores nothing and changes nothing. Classes (reported per unit, with the numbers behind them):

  a  no trace: the unit's words are not in any accessibility-tree row of that time (row never entered the tree)
  b  in the tree, never inside the viewport (offscreen or scrolled out): the words were never published
  c  published, but the displayed final word differs from the source word (recognition error); closest word given
  d  published, final word matches, and the matcher still could not assign it (reason from the matcher's own fields)
  e  other

Row time text is the app's clock at the start of a row; it tracks the source time of the speech (not the display time),
so rows are located by time text in [start-3.5 s, end+1 s] of the unit. Coverage figures compare the unit's reference words
with the words of those rows (tree = all words in the tree, pub = words that were published, i.e. visible at a sample).

  python classify-unidentified.py --raw RAW --converted-dir DIR --annotations-dir DIR --actions ACTIONS --out FILE
"""
import argparse
import collections
import difflib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import observer_publications as op  # noqa: E402
import occurrence_matcher as om  # noqa: E402

FAILURE_WINDOW = (170.0, 245.0)  # Protocol v3 section 2/Layer B window, as given in the task
TRACKS = ("microphone", "meeting")
BEFORE_S, AFTER_S = 3.5, 1.0
ROW_SPAN_S = 4.0  # a row spans about 4 s of speech
GAP_S = 2.0  # an uncovered stretch of speech this long means rows of that time are absent


def seconds(clock):
    minutes, secs = clock.split(":")[-2:]
    return int(minutes) * 60 + int(secs)


def tokens(words):
    return [token for word in words for token in om.normalize_words(word)]


def scroll_windows(actions_path, origin, frequency, shift):
    """Intervals (recording seconds) during which the viewport was scripted away from the live end."""
    events = []
    for line in Path(actions_path).read_text(encoding="utf-8-sig").splitlines():
        parts = line.split("\t")
        if len(parts) >= 3 and parts[0].isdigit():
            events.append(((int(parts[0]) - origin) / frequency + shift, parts[2]))
    windows, opened = [], None
    for at, text in events:
        if text.startswith("scroll: up") and opened is None:
            opened = at
        elif text.startswith("pressed 'Jump to Live'") and opened is not None:
            windows.append([round(opened, 1), round(at, 1)])
            opened = None
    return windows


def sample_tables(samples, origin, frequency):
    """Per sample: row key -> list of (text, visible); u of the sample; harness end time."""
    labels = op.DEFAULT_LABELS
    tables, previous_begin, out = [], None, []
    for sample in samples:
        viewport = sample.get("viewport")
        rows = {}
        for row in op.split_rows(sample.get("elements", []), labels):
            if row["time"] and row["track"] is not None:
                rows.setdefault((row["track"], row["time"]), []).append(
                    [(w["text"], w["visible"]) for w in op.row_words(row, viewport)])
        u = (sample["qpc_end"] - previous_begin) / frequency if previous_begin is not None else None
        previous_begin = sample["qpc_begin"]
        out.append({"rows": {k: v[0] for k, v in rows.items() if len(v) == 1}, "u": u,
                    "end": (sample["qpc_end"] - origin) / frequency, "rows_in_tree": len(rows),
                    "rows_in_viewport": sum(1 for v in rows.values() if any(w[1] for w in v[0]))})
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--converted-dir", type=Path, required=True, help="holds timestamped-<track>.json")
    parser.add_argument("--annotations-dir", type=Path, required=True, help="holds <track>-source-annotations-DRAFT.json")
    parser.add_argument("--actions", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    header, samples = op.load_raw(str(args.raw))
    origin, frequency = header["origin_qpc"], header["qpc_frequency"]
    tables = sample_tables(samples, origin, frequency)
    report = {"status": "DRAFT diagnostic, not a score", "failure_window_s": list(FAILURE_WINDOW), "tracks": {}}
    for track in TRACKS:
        doc = json.loads((args.converted_dir / ("timestamped-%s.json" % track)).read_text(encoding="utf-8"))
        shift = doc["conversion"]["shift_s"]
        annotations = json.loads((args.annotations_dir / (track + "-source-annotations-DRAFT.json")).read_text(encoding="utf-8"))
        rows = om.align_occurrences({"utterances": annotations["utterances"]}, doc["words"], track, clock_basis="recording")
        published = collections.defaultdict(dict)
        for word in doc["words"]:
            _, clock, index = word["id"].split("|")
            published[clock][int(index)] = word
        seen = {}
        for i, table in enumerate(tables):
            for key, words in table["rows"].items():
                if key[0] != track:
                    continue
                entry = seen.setdefault(key[1], {"samples": 0, "first": i, "texts": [], "visible_samples": 0})
                entry["samples"] += 1
                entry["visible_samples"] += any(w[1] for w in words)
                if len(words) > len(entry["texts"]):
                    entry["texts"] = [w[0] for w in words]
        scrolls = scroll_windows(args.actions, origin, frequency, shift)
        units = []
        for row in rows:
            if row["outcome"] == "UNIDENTIFIED":
                at = rows.index(row)
                near = [t for other in rows[max(0, at - 1):at] + rows[at + 1:at + 2] for t in tokens(other["reference_words"])]
                units.append(classify(row, seen, published, tables, shift, scrolls, near))
        counts = collections.Counter(u["class"] for u in units)
        report["tracks"][track] = {"scripted_scroll_windows_recording_s": scrolls, "unidentified": len(units),
                                   "by_class": dict(sorted(counts.items())), "units": units}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as stream:
        json.dump(report, stream, indent=1)
    for track, block in report["tracks"].items():
        print(track, block["unidentified"], block["by_class"])


def classify(row, seen, published, tables, shift, scrolls, neighbours):
    start, end = row["source_start_s"], row["source_last_word_end_s"]
    ref = tokens(row["reference_words"])
    keys = sorted((k for k in seen if start - BEFORE_S <= seconds(k) <= end + AFTER_S), key=seconds)
    tree_words = [t for k in keys for t in tokens(seen[k]["texts"])]
    pub_words = [t for k in keys for _, w in sorted(published.get(k, {}).items()) for t in tokens([w["text"]])]
    matcher = difflib.SequenceMatcher(None, ref, pub_words, autojunk=False)
    tree_cov = sum(b.size for b in difflib.SequenceMatcher(None, ref, tree_words, autojunk=False).get_matching_blocks()) / len(ref)
    pub_cov = sum(b.size for b in matcher.get_matching_blocks()) / len(ref)
    last = ref[-1]
    displayed = None  # what is shown where the source's final word should be
    if len(ref) > 1:
        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if i1 <= len(ref) - 1 < i2:
                displayed = (tag, pub_words[j1:j2])
    else:
        others = set(neighbours)
        extra = [w for w in pub_words if w not in others and w != last]
        displayed = ("equal", [last]) if last in pub_words else (("replace", extra) if extra else ("delete", []))
    reasons = []
    if row["endpoint_missing_in_optimal_alignment"]:
        reasons.append("endpoint deleted in the optimal alignment")
    if row["repetition_identity_unresolved"]:
        reasons.append("repetition: output could belong to a later identical sentence")
    if not row["identity_unique"]:
        reasons.append("endpoint claimed by more than one unit or ambiguous")
    if row["other_words_exact_fraction"] < 0.6 and len(ref) > 1:
        reasons.append("other words exact %.2f < 0.60" % row["other_words_exact_fraction"])
    first_tree = min((seen[k]["first"] for k in keys), default=None)
    in_view = sum(1 for k in keys if seen[k]["visible_samples"])
    covered_until, gap = start, 0.0
    for k in keys:  # longest stretch of the unit's speech that no row in the tree covers (a row spans about 4 s)
        gap = max(gap, seconds(k) - covered_until)
        covered_until = max(covered_until, seconds(k) + ROW_SPAN_S)
    gap = max(gap, end - covered_until)
    if not keys:
        cls, why = "a", "no row for this time ever entered the accessibility tree"
    elif displayed and displayed[0] == "equal" and pub_cov >= 0.6:
        cls, why = "d", "published, final word matches; " + ("; ".join(reasons) or "no matcher reason recorded")
    elif (tree_cov >= 0.6 and pub_cov < 0.6) or (len(ref) == 1 and last in tree_words):
        cls, why = "b", "words were in the tree but mostly outside the viewport (published %.0f%%)" % (100 * pub_cov)
    elif displayed and displayed[0] == "replace" and displayed[1] and gap < GAP_S:
        cls, why = "c", "rows are present; different words are displayed where the source words are"
    elif gap >= GAP_S and len(ref) > 1:
        cls, why = "a", "part of the speech has no row in the tree (uncovered stretch %.1f s)" % gap
    elif len(ref) > 1 and pub_cov >= 0.6 and not (displayed and displayed[1]):
        cls, why = "a", "the tail holding the final word is not displayed anywhere (its row never entered the tree)"
    elif len(ref) > 1 and pub_cov >= 0.6:
        cls, why = "c", "rows are present; the recognizer output stops short of the source's final words"
    elif len(ref) > 1:
        cls, why = "c", "rows are present, but most of the displayed words differ from the source words"
    else:
        cls, why = "a", "no displayed word at the position of the short word"
    u_values = [published[k][j]["u"] for k in keys for j in published.get(k, {})]
    in_scroll = any(a <= end + 6 and b >= start for a, b in scrolls)
    first_time = round(tables[first_tree]["end"] + shift, 2) if first_tree is not None else None
    return {"id": row["id"], "short": row["short"], "source_start_s": round(start, 2), "source_end_s": round(end, 2),
            "in_failure_window": start <= FAILURE_WINDOW[1] and end >= FAILURE_WINDOW[0],
            "overlaps_scripted_scroll_window_plus_6s": in_scroll, "class": cls, "cause": why,
            "reference": " ".join(row["reference_words"]), "last_word": last,
            "displayed_where_final_word_should_be": displayed[1] if displayed else None,
            "row_times_in_tree": keys, "tree_coverage": round(tree_cov, 2), "published_coverage": round(pub_cov, 2),
            "max_u_of_published_words_in_rows_s": round(max(u_values), 3) if u_values else None,
            "first_sample_with_rows": first_tree, "first_sample_time_recording_s": first_time,
            "rows_in_tree_at_that_sample": tables[first_tree]["rows_in_tree"] if first_tree is not None else None,
            "rows_ever_in_viewport": in_view, "uncovered_speech_s": round(gap, 1),
            "matcher": {"candidates": row["candidate_publication_ids"],
                        "other_words_exact_fraction": round(row["other_words_exact_fraction"], 2), "reasons": reasons}}


if __name__ == "__main__":
    main()
