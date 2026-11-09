"""Align visible word publications to annotated occurrences without guessing identity."""
import argparse
import importlib.util
import json
import math
from pathlib import Path
import re


def normalize_words(text):
    """Normalize case and punctuation while retaining word order."""
    return re.findall(r"\w+", text.casefold(), re.UNICODE)


def align_occurrences(annotations, publications, track):
    """Return bounds-compatible rows from every minimum-edit chronological alignment.

    Publications are first-visible word positions, not repeated viewport snapshots.
    Stable word IDs deduplicate polls; optional independently established audio spans
    constrain identity without imposing a maximum publication latency.
    """
    units = annotations["utterances"]
    refs = []
    ranges = []
    previous_end = -math.inf
    for index, unit in enumerate(units):
        if not (previous_end <= unit["start"] <= unit["last_word_start"]):
            raise ValueError("Annotations must be chronological and nonoverlapping")
        previous_end = unit["latest_acoustic_end_s"]
        words = normalize_words(" ".join(unit["reference_words"]))
        if not words:
            raise ValueError("Empty reference utterance")
        ranges.append((len(refs), len(refs)+len(words)))
        refs.extend((word, index) for word in words)
    pubs = []
    seen = {}
    for publication in publications:
        if publication["track"] != track:
            continue
        item = dict(publication)
        tokens = normalize_words(item["text"])
        if len(tokens) != 1:
            raise ValueError("Each publication must identify one visible word position")
        if not all(math.isfinite(item[key]) for key in ("observed", "u")) or item["u"] < 0:
            raise ValueError("Invalid publication interval")
        if item["id"] in seen:
            prior = seen[item["id"]]
            if tokens[0] != prior["token"] or item["observed"] < prior["observed"]:
                raise ValueError("Conflicting or nonchronological stable word ID")
            continue
        item["token"] = tokens[0]
        if pubs and item["observed"] < pubs[-1]["observed"]:
            raise ValueError("Publications must be chronological")
        if "audio_start" in item or "audio_end" in item:
            if not (math.isfinite(item["audio_start"]) and math.isfinite(item["audio_end"])
                    and item["audio_start"] <= item["audio_end"]):
                raise ValueError("Invalid independent audio span")
        seen[item["id"]] = item
        pubs.append(item)
    n, m = len(refs), len(pubs)

    def allow_pair(i, j):
        """Reject pre-speech endpoints and incompatible independent source spans."""
        unit = units[refs[i][1]]
        pub = pubs[j]
        if i+1 == ranges[refs[i][1]][1] and pub["observed"] < unit["last_word_start"]:
            return False
        return "audio_start" not in pub or (
            pub["audio_start"] < unit["latest_acoustic_end_s"]
            and pub["audio_end"] >= unit["start"])

    def get_edges(i, j):
        """Generate word insertion, deletion, and allowed diagonal transitions."""
        if i < n:
            yield i+1, j, 1, False
        if j < m:
            yield i, j+1, 1, False
        if i < n and j < m and allow_pair(i, j):
            exact = refs[i][0] == pubs[j]["token"]
            yield i+1, j+1, int(not exact), exact

    forward = [[math.inf]*(m+1) for _ in range(n+1)]
    forward[0][0] = 0
    for i in range(n+1):
        for j in range(m+1):
            for a, b, cost, _ in get_edges(i, j):
                forward[a][b] = min(forward[a][b], forward[i][j]+cost)
    backward = [[math.inf]*(m+1) for _ in range(n+1)]
    backward[n][m] = 0
    for i in range(n, -1, -1):
        for j in range(m, -1, -1):
            for a, b, cost, _ in get_edges(i, j):
                backward[i][j] = min(backward[i][j], cost+backward[a][b])
    optimum = forward[n][m]
    candidates = []
    missing = []
    for index, (start, end) in enumerate(ranges):
        hits = {(start, j): 0 for j in range(m+1)
                if forward[start][j]+backward[start][j] == optimum}
        endpoints = {}
        deleted = False
        for i in range(start, end):
            for j in range(m+1):
                if (i, j) not in hits:
                    continue
                for a, b, cost, exact in get_edges(i, j):
                    if forward[i][j]+cost+backward[a][b] != optimum:
                        continue
                    count = hits[i, j]
                    if a == end:
                        if b == j:
                            deleted = True
                        else:
                            endpoints[j] = min(endpoints.get(j, math.inf), count)
                    elif a <= end:
                        value = count+int(exact and a > i)
                        hits[a, b] = min(hits.get((a, b), math.inf), value)
        candidates.append(endpoints)
        missing.append(deleted)
    claims = {}
    for index, endpoints in enumerate(candidates):
        for j in endpoints:
            claims.setdefault(j, set()).add(index)
    rows = []
    for index, unit in enumerate(units):
        start, end = ranges[index]
        count = end-start
        endpoints = candidates[index]
        reliable = bool(endpoints) and not missing[index]
        substituted = False
        uncertain_repetition = False
        boundary = False
        for j, hits in endpoints.items():
            pub = pubs[j]
            boundary |= pub.get("observed_nominal", pub["observed"]) < unit["last_word_start"]
            later = [other for other in units[index+1:]
                     if normalize_words(" ".join(other["reference_words"]))
                     == [word for word, _ in refs[start:end]]]
            # Chronology cannot distinguish delayed output from a later identical sentence.
            uncertain_repetition |= ("audio_start" not in pub and bool(later)
                                     and pub["observed"] >= later[0]["last_word_start"])
            exact = refs[end-1][0] == pubs[j]["token"]
            if count > 1:
                reliable &= hits/(count-1) >= 0.6
            if not exact:
                substituted = True
                reliable &= count >= 3 and hits/(count-1) >= 0.6 and len(claims[j]) == 1
        reliable &= not uncertain_repetition
        outcome = "UNIDENTIFIED"
        if reliable:
            outcome = "BOUNDED" if len(endpoints) > 1 or boundary else (
                "MATCHED-SUBSTITUTED" if substituted else "MATCHED")
        row = {**unit, "track": track, "last_word_end": unit["latest_acoustic_end_s"],
               "outcome": outcome, "identity_confirmed": bool(reliable),
               "identity_unique": all(len(claims[j]) == 1 for j in endpoints),
               "reference_word_count": count,
               "other_words_exact_fraction": min(endpoints.values(), default=0)/max(1, count-1),
               "endpoints": [{"observed": pubs[j]["observed"], "u": pubs[j]["u"],
                              "publication_id": pubs[j]["id"]} for j in sorted(endpoints)] if reliable else [],
               "candidate_publication_ids": [pubs[j]["id"] for j in sorted(endpoints)],
               "repetition_identity_unresolved": uncertain_repetition,
               "endpoint_missing_in_optimal_alignment": missing[index]}
        rows.append(row)
    return rows


def main():
    """Write an offline alignment report without freezing or scoring annotations."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("annotations", type=Path)
    parser.add_argument("publications", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--track", choices=("microphone", "meeting"), required=True)
    parser.add_argument("--clock", type=Path, help="Valid marker clock report; maps harness publications to recording time")
    args = parser.parse_args()
    annotations = json.loads(args.annotations.read_text(encoding="utf-8-sig"))
    publications = json.loads(args.publications.read_text(encoding="utf-8-sig"))
    words = publications["words"]
    if args.clock:
        spec = importlib.util.spec_from_file_location("marker_clock", Path(__file__).with_name("marker_clock.py"))
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        clock = json.loads(args.clock.read_text(encoding="utf-8-sig"))
        words = module.map_publications(words, clock)
    rows = align_occurrences(annotations, words, args.track)
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump({"status": "OFFLINE_ALIGNMENT_ONLY", "units": rows}, stream, indent=2)
        stream.write("\n")


if __name__ == "__main__":
    main()
