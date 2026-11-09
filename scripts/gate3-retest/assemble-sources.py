"""Assemble independently marked invented sources without playing or recording audio."""
import argparse
import array
import hashlib
import json
import math
import re
from pathlib import Path
import wave


def normalize_word(text):
    """Compare reference vocabulary without punctuation or case differences."""
    return re.sub(r"[^a-z0-9]", "", text.lower())


def place_units(track, clips):
    """Fit whole utterances by distributing gaps instead of leaving a silent tail."""
    choices = {kind: [clip for clip in clips if clip["kind"] == kind] for kind in ("short", "long")}
    assert all(choices.values()), "Both short and long source clips are required"
    assert all(0.3 <= clip["duration"] < 1 for clip in choices["short"]), "Short duration needs review; do not silently time-stretch"
    assert all(4 <= clip["duration"] <= 12 for clip in choices["long"]), "Long duration needs review"
    counters, units = {"short": 0, "long": 0}, []
    offset = 0 if track == "microphone" else 0.25
    windows = [(20+offset, 169, 0.8, 2.5), (170+offset, 245-offset, 0, 0.49),
               (246, 380-offset, 0.8, 2.5)]
    for left, right, minimum, maximum in windows:
        span = right-left
        limits = {kind: int(span/min(clip["duration"] for clip in pool))+1 for kind, pool in choices.items()}
        sums = {}
        for kind, pool in choices.items():
            sums[kind] = [0]
            for index in range(limits[kind]):
                sums[kind].append(sums[kind][-1]+pool[(counters[kind]+index) % len(pool)]["duration"])
        candidates = []
        minimum_shorts = 8 if 170 <= left < 171 else 0
        seen_shorts = sum(unit["short"] for unit in units)
        for long_count in range(1, limits["long"]+1):
            for short_count in range(minimum_shorts, limits["short"]+1):
                count = long_count+short_count
                remaining = span-sums["long"][long_count]-sums["short"][short_count]
                if count > 1 and minimum*(count-1) <= remaining <= maximum*(count-1):
                    gap = remaining/(count-1)
                    fraction = (seen_shorts+short_count)/(len(units)+count)
                    candidates.append((abs(fraction-0.4), abs(gap-(0.15 if minimum == 0 else 1.2)), long_count, short_count, gap))
        assert candidates, "No placement fits the protocol without altering speech"
        _, _, long_count, short_count, gap = min(candidates)
        planned, chosen_shorts = [], 0
        for index in range(long_count+short_count):
            kind = "short" if (index+1)*short_count/(long_count+short_count) > chosen_shorts else "long"
            chosen_shorts += kind == "short"
            planned.append(choices[kind][counters[kind] % len(choices[kind])])
            counters[kind] += 1
        cursor = left
        for clip in planned:
            units.append({"id": f"{track}-{len(units):03}", "track": track, "source": clip["id"],
                          "start": cursor, "end": cursor+clip["duration"], "short": clip["kind"] == "short",
                          "eligible": None, "eligibility_reason": "pending waveform and listen audit",
                          "words": [{"text": word["text"], "start": cursor+word["start"],
                                     "end": cursor+word["end"]} for word in clip["words"]]})
            cursor += clip["duration"]+gap
    return units


def measure_window_gap(intervals, left, right):
    """Include leading and trailing silence when checking continuous speech."""
    cursor, largest = left, 0
    for start, end in sorted(intervals):
        if end <= left or start >= right:
            continue
        largest = max(largest, max(left, start)-cursor)
        cursor = max(cursor, min(end, right))
    return max(largest, right-cursor)


def assert_track_coverage(units):
    """Reject prospective sources that violate duration, spacing or failure coverage."""
    assert units and units[0]["start"] <= 20.5 and units[-1]["end"] >= 379.5, "Scored span must cover six minutes"
    shorts = [unit for unit in units if unit["short"]]
    fraction = len(shorts)/len(units)
    assert 0.35 <= fraction <= 0.45, "About 40% short units required (draft operational tolerance 35-45%)"
    assert sum(170 <= unit["start"] and unit["end"] <= 245 for unit in shorts) >= 8, "At least eight failure-window short units required"
    words = []
    for index, unit in enumerate(units):
        assert 20-1e-9 <= unit["start"] < unit["end"] <= 380+1e-9
        duration = unit["end"]-unit["start"]
        assert (0.3-1e-9 <= duration < 1) if unit["short"] else (4-1e-9 <= duration <= 12+1e-9)
        assert len(unit["words"]) == 1 if unit["short"] else len(unit["words"]) >= 1
        previous_end = unit["start"]
        for word in unit["words"]:
            assert unit["start"]-1e-9 <= word["start"] < word["end"] <= unit["end"]+1e-9
            assert word["start"] >= previous_end-1e-9, "Overlapping word timings"
            assert normalize_word(word["text"]) not in {"uh", "um", "uhhuh", "okay"}, "Filler requires exclusion before freeze"
            previous_end = word["end"]
            words.append(word)
        if index:
            prior = units[index-1]
            gap = unit["start"]-prior["end"]
            assert gap >= -1e-9, "Same-track overlap"
            if unit["start"] <= 170 or prior["end"] >= 245:
                assert 0.8-1e-9 <= gap <= 2.5+1e-9, "Outside-window gap must be 0.8-2.5 seconds"
    largest = measure_window_gap([(word["start"], word["end"]) for word in words], 170, 245)
    assert largest < 0.5, "Failure-window speech gap is 0.5 seconds or more"
    for index, unit in enumerate(shorts):
        for prior in shorts[:index]:
            if normalize_word(prior["words"][0]["text"]) == normalize_word(unit["words"][0]["text"]):
                assert unit["start"]-prior["start"] >= 30, "Short word repeats within 30 seconds"
    return {"short_fraction": fraction, "failure_window_max_word_gap_seconds": largest,
            "short_mix_tolerance": [0.35, 0.45], "waveform_and_listen_review": "pending"}


def assert_joint_coverage(tracks):
    """Require disjoint vocabularies and at least half the scored time in overlap."""
    vocabularies = [{normalize_word(word["text"]) for unit in units for word in unit["words"]} for units in tracks]
    assert not (vocabularies[0] & vocabularies[1]), "Track vocabularies must be disjoint"
    overlap = 0
    left = right = 0
    while left < len(tracks[0]) and right < len(tracks[1]):
        a, b = tracks[0][left], tracks[1][right]
        overlap += max(0, min(a["end"], b["end"], 380)-max(a["start"], b["start"], 20))
        if a["end"] <= b["end"]:
            left += 1
        else:
            right += 1
    assert overlap >= 180, "Both tracks must speak together for at least half of 360 seconds"
    return overlap


def read_json(path):
    """Read UTF-8 JSON including Windows PowerShell output."""
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path, value):
    """Write a new artifact without replacing existing evidence."""
    with path.open("x", encoding="utf-8") as stream:
        json.dump(value, stream, indent=2)
        stream.write("\n")


def assemble_track(track, renders, source, output):
    """Place engine-marked units in the protocol's prospective time windows."""
    rate = 24000
    pcm = array.array("h", [0]) * (420 * rate)
    clips = []
    for render in renders:
        if render["track"] != track:
            continue
        with wave.open(str(source / render["file"]), "rb") as stream:
            assert (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) == (1, 2, rate)
            data = array.array("h")
            data.frombytes(stream.readframes(stream.getnframes()))
        marks = {mark["name"]: mark["seconds"] for mark in render["marks"]}
        words = render["text"].split()
        start, end = marks["s0"], marks[f"e{len(words)-1}"]
        assert end > start
        clips.append({**render, "pcm": data, "duration": end-start,
                      "trim": start, "words": [
                          {"text": word, "start": marks[f"s{i}"]-start,
                           "end": marks[f"e{i}"]-start}
                          for i, word in enumerate(words)]})
    units = place_units(track, clips)
    coverage = assert_track_coverage(units)
    by_id = {clip["id"]: clip for clip in clips}
    for unit in units:
        clip = by_id[unit["source"]]
        begin, finish = round(unit["start"]*rate), round(unit["end"]*rate)
        raw = clip["pcm"][round(clip["trim"]*rate):round(clip["trim"]*rate)+finish-begin]
        assert len(raw) == finish-begin
        pcm[begin:finish] = raw
    frequency = 880 if track == "microphone" else 1320
    for origin in (1, 381):
        for pulse in range(3):
            start = round((origin+pulse*0.5)*rate)
            for i in range(round(0.2*rate)):
                pcm[start+i] = round(8000*math.sin(2*math.pi*frequency*i/rate))
    wav_path = output / f"{track}.wav"
    with wav_path.open("xb") as raw_stream:
        with wave.open(raw_stream, "wb") as stream:
            stream.setparams((1, 2, rate, len(pcm), "NONE", "not compressed"))
            stream.writeframes(pcm.tobytes())
    write_json(output / f"{track}-annotations.json", units)
    shorts = [unit for unit in units if unit["short"]]
    inside = [unit for unit in shorts if 170 <= unit["start"] and unit["end"] <= 245]
    repeated = []
    for i, unit in enumerate(shorts):
        for prior in shorts[:i]:
            if prior["words"][0]["text"] == unit["words"][0]["text"] and unit["start"]-prior["start"] < 30:
                repeated.append(unit["id"])
    return {"track": track, "units": len(units), "shorts": len(shorts),
            "short_fraction": len(shorts)/len(units), "failure_window_shorts": len(inside),
            "short_repeats_under_30s": repeated, "wav_sha256": hashlib.sha256(wav_path.read_bytes()).hexdigest(),
            "coverage": coverage, "freeze_ready": False, "units_data": units}


def main():
    """Create a prospective source pack with pending human eligibility review."""
    parser = argparse.ArgumentParser()
    parser.add_argument("renders", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(exist_ok=False)
    renders = read_json(args.renders / "engine-marks.json")
    reports = [assemble_track(track, renders, args.renders, args.output) for track in ("microphone", "meeting")]
    timelines = [report.pop("units_data") for report in reports]
    overlap = assert_joint_coverage(timelines)
    vocabularies = [{word["text"].lower().strip(".,") for unit in units for word in unit["words"]} for units in timelines]
    write_json(args.output / "source-audit.json", {"tracks": reports, "overlap_seconds": overlap,
               "scored_seconds": 360, "failure_window": [170, 245], "required_interval": [203, 214],
               "shared_vocabulary": sorted(vocabularies[0] & vocabularies[1]),
               "waveform_spot_check": "pending", "listen_through": "pending", "frozen": False})
    print(json.dumps({"tracks": reports, "overlap_seconds": overlap}))


if __name__ == "__main__":
    main()
