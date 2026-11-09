"""Assemble independently marked invented sources without playing or recording audio."""
import argparse
import array
import hashlib
import json
import math
from pathlib import Path
import wave


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
    short = [clip for clip in clips if clip["kind"] == "short"]
    long = [clip for clip in clips if clip["kind"] == "long"]
    assert all(0.3 <= clip["duration"] < 1 for clip in short), "Short duration needs review; do not silently time-stretch"
    assert all(4 <= clip["duration"] <= 12 for clip in long), "Long duration needs review"
    units, counters = [], {"short": 0, "long": 0}
    # Alternate short and long inside the failure window to provide at least eight short units.
    for left, right, gap, pattern in [(20, 170, 1.2, ["long", "long", "short", "long", "short"]),
                                     (170, 245, 0.15, ["long", "short"]),
                                     (245, 380, 1.2, ["long", "long", "short", "long", "short"])]:
        cursor, step = left + (0 if track == "microphone" else 0.25), 0
        while True:
            kind = pattern[step % len(pattern)]
            choices = short if kind == "short" else long
            clip = choices[counters[kind] % len(choices)]
            duration = clip["duration"]
            if cursor + duration > right:
                break
            begin, finish = round(cursor*rate), round((cursor+duration)*rate)
            raw = clip["pcm"][round(clip["trim"]*rate):round(clip["trim"]*rate)+finish-begin]
            assert len(raw) == finish-begin
            pcm[begin:finish] = raw
            units.append({"id": f"{track}-{len(units):03}", "track": track, "source": clip["id"],
                          "start": cursor, "end": cursor+duration, "short": kind == "short",
                          "eligible": None, "eligibility_reason": "pending waveform and listen audit",
                          "words": [{"text": word["text"], "start": cursor+word["start"],
                                     "end": cursor+word["end"]} for word in clip["words"]]})
            counters[kind] += 1
            cursor += duration + gap
            step += 1
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
            "freeze_ready": False, "units_data": units}


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
    overlap = sum(any(u["start"] <= t/100 < u["end"] for u in timelines[0]) and
                  any(u["start"] <= t/100 < u["end"] for u in timelines[1]) for t in range(2000, 38000))/100
    vocabularies = [{word["text"].lower().strip(".,") for unit in units for word in unit["words"]} for units in timelines]
    write_json(args.output / "source-audit.json", {"tracks": reports, "overlap_seconds": overlap,
               "scored_seconds": 360, "failure_window": [170, 245], "required_interval": [203, 214],
               "shared_vocabulary": sorted(vocabularies[0] & vocabularies[1]),
               "waveform_spot_check": "pending", "listen_through": "pending", "frozen": False})
    print(json.dumps({"tracks": reports, "overlap_seconds": overlap}))


if __name__ == "__main__":
    main()
