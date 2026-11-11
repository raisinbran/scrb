"""Validate probe metadata and prepare independent source timing without recognition."""
import argparse
import array
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import wave


def select_encoding(probes, voices):
    """Use the first fully passing encoding for every required voice."""
    for encoding in ("A", "C", "B"):
        matches = [row for row in probes if row["encoding"] == encoding]
        if len(matches) == len(voices) and {row["voice"] for row in matches} == set(voices):
            if all(row["passed"] and row["position_non_decreasing"] and row["expected"] == row["received"] for row in matches):
                return encoding
    raise ValueError("No bookmark encoding passed completely for both voices")


def read_pcm(path):
    """Read only explicitly supplied invented probe/render PCM files."""
    with wave.open(str(path), "rb") as stream:
        if (stream.getnchannels(), stream.getsampwidth(), stream.getframerate()) != (1, 2, 24000):
            raise ValueError("Expected mono PCM16 at 24000 Hz")
        samples = array.array("h")
        samples.frombytes(stream.readframes(stream.getnframes()))
    return samples, 24000


def validate_marks(marks, expected, duration):
    """Require ordered unique names and monotonic audio positions inside the WAV."""
    names = [mark["name"] for mark in marks]
    positions = [mark["seconds"] for mark in marks]
    monotonic = all(math.isfinite(value) and 0 <= value <= duration+1/24000 for value in positions)
    monotonic = monotonic and all(a <= b for a, b in zip(positions, positions[1:]))
    return names == expected and monotonic, monotonic


def derive_energy_bounds(samples, rate, start, limit):
    """Find speech energy with a silent release before the next bookmark boundary."""
    left, right, step = round(start*rate), round(limit*rate), round(0.005*rate)
    if not 0 <= left < right <= len(samples):
        raise ValueError("Invalid energy search interval")
    frames = [(offset, min(offset+step, right)) for offset in range(left, right, step)]
    rms = [math.sqrt(sum(value*value for value in samples[a:b])/(b-a)) for a, b in frames]
    threshold = max(128, max(rms, default=0)*0.03)
    active = [index for index, value in enumerate(rms) if value >= threshold]
    if not active or active[-1] == len(frames)-1:
        raise ValueError("No independently observable speech release before boundary; B is not usable")
    # The next mark limits the search only; it is never substituted for the acoustic end.
    return frames[active[0]][0]/rate, frames[active[-1]][1]/rate


def finalize_render(descriptor):
    """Keep engine evidence separate from acoustic or constructed word boundaries."""
    encoding, text = descriptor["encoding"], descriptor["text"]
    words = text.split()
    output = Path(descriptor["file"])
    metadata = {"encoding": encoding, "voice": descriptor["voice"], "expected": 2*len(words),
                "received": 0, "passed": False, "position_non_decreasing": False}
    if encoding == "C":
        if len(descriptor["parts"]) != len(words):
            raise ValueError("Not every independently rendered word completed")
        combined, marks = array.array("h"), []
        for index, part in enumerate(descriptor["parts"]):
            samples, rate = read_pcm(Path(part["file"]))
            valid, _ = validate_marks(part["marks"], ["s0", "e0"], len(samples)/rate)
            if not part["complete"] or not valid:
                raise ValueError("Incomplete engine bookmarks in independently rendered word")
            left, right = [round(mark["seconds"]*rate) for mark in part["marks"]]
            if left >= right:
                raise ValueError("Empty independently rendered word")
            if index:
                combined.extend([0]*round(0.030*rate))
            marks.append({"name": f"s{index}", "seconds": len(combined)/rate})
            combined.extend(samples[left:right])
            marks.append({"name": f"e{index}", "seconds": len(combined)/rate})
        with output.open("xb") as raw:
            with wave.open(raw, "wb") as stream:
                stream.setparams((1, 2, rate, len(combined), "NONE", "not compressed"))
                stream.writeframes(combined.tobytes())
        with Path(str(output)+".bookmarks.tsv").open("x", encoding="utf-8") as log:
            log.write("utc\telapsed_ms_after_return\texpected_count\tbookmark_count\tmissing\tduplicates\tunexpected\tout_of_order\taudio_positions_nondecreasing\taudio_positions_seconds\treceived_utc\tbasis\n")
            log.write(f"{datetime.now(timezone.utc).isoformat()}\t0\t{2*len(words)}\t{len(marks)}\t\t\t\tFalse\tTrue\t"+
                      ",".join(f"{mark['name']}={mark['seconds']:.9f}" for mark in marks)+"\t\texact_sample_construction; see per-word callback timelines\n")
        metadata["timing_basis"] = "Independent one-word SSML, cropped to its observed marks, exact sample concatenation with 720-sample gaps; all per-word engine timelines retained"
    else:
        samples, rate = read_pcm(output)
        raw_marks = descriptor["marks"]
        expected = ([f"s{i}" for i in range(len(words))]+[f"e{len(words)-1}"] if encoding == "B"
                    else [name for i in range(len(words)) for name in (f"s{i}", f"e{i}")])
        metadata["expected"], metadata["received"] = len(expected), len(raw_marks)
        valid, monotonic = validate_marks(raw_marks, expected, len(samples)/rate)
        metadata["position_non_decreasing"] = monotonic
        if not descriptor["complete"] or not valid:
            return {**metadata, "error": "Incomplete engine bookmarks or invalid AudioPosition values"}
        marks = raw_marks
        metadata["engine_marks"] = raw_marks
        if encoding == "B":
            marks = []
            for index in range(len(words)):
                start, limit = raw_marks[index]["seconds"], raw_marks[index+1]["seconds"]
                acoustic_start, acoustic_end = derive_energy_bounds(samples, rate, start, limit)
                marks.extend([{"name": f"s{index}", "seconds": acoustic_start},
                              {"name": f"e{index}", "seconds": acoustic_end}])
            metadata["timing_basis"] = "5 ms PCM RMS energy frames; threshold max(128, 3% local peak RMS); require an inactive release frame; next start is a search bound only; waveform/listening confirmation required"
        else:
            metadata["timing_basis"] = "Observed AudioPosition bookmarks with explicit 30 ms inter-word breaks"
    expected = [name for i in range(len(words)) for name in (f"s{i}", f"e{i}")]
    samples, rate = read_pcm(output)
    valid, monotonic = validate_marks(marks, expected, len(samples)/rate)
    positive = valid and all(marks[2*i]["seconds"] < marks[2*i+1]["seconds"] for i in range(len(words)))
    return {**metadata, "expected": metadata["expected"],
            "received": metadata["received"] if encoding == "B" else len(marks),
            "passed": valid and positive, "position_non_decreasing": monotonic, "marks": marks,
            "waveform_listening_review": "pending"}


def main():
    """Write probe decisions or per-render timing without replacing evidence."""
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=("finalize", "select"))
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8-sig"))
    try:
        result = finalize_render(data) if args.operation == "finalize" else {
            "selected_encoding": select_encoding(data["probes"], data["voices"])}
    except (ValueError, KeyError, OSError, wave.Error) as error:
        result = {"passed": False, "error": str(error), "encoding": data.get("encoding"),
                  "voice": data.get("voice"), "expected": data.get("expected", 0),
                  "received": sum(len(part["marks"]) for part in data["parts"]) if data.get("encoding") == "C" else len(data.get("marks", [])),
                  "position_non_decreasing": False}
    with args.output.open("x", encoding="utf-8") as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
        stream.write("\n")
    if args.operation == "select" and "selected_encoding" not in result:
        raise SystemExit(result["error"])


if __name__ == "__main__":
    main()
