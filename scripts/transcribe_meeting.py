# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = [
#     "whisperx==3.8.6",
#     "av==19.0.2",
#     "numpy==2.3.4",
#     "torch==2.8.0",
#     "torchaudio==2.8.0",
#     "torchvision==0.23.0",
# ]
#
# [tool.uv.sources]
# torch = [{ index = "pytorch-cpu", marker = "sys_platform != 'darwin'" }]
# torchaudio = [{ index = "pytorch-cpu", marker = "sys_platform != 'darwin'" }]
# torchvision = [{ index = "pytorch-cpu", marker = "sys_platform != 'darwin'" }]  # noqa: E501
#
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# ///
"""Turn a recorded meeting folder into a transcript with speaker labels.

Read main, load_meeting_audio, transcribe, and format_transcript first.
The model packages import only inside transcribe, so tests can load this
module with just av and numpy installed.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import av
import numpy as np

SAMPLE_RATE = 16000
TRACK_DIRS = ("microphone", "meeting")
DIARIZATION_MODEL = "pyannote/speaker-diarization-community-1"

MISSING_TOKEN_MESSAGE = (
    "HF_TOKEN is not set. Diarization needs a Hugging Face read token.\n"
    "Set it in your shell and run again, for example with\n"
    '  export HF_TOKEN="<your token>"      (macOS zsh)\n'
    '  $env:HF_TOKEN = "<your token>"      (Windows PowerShell)\n'
    "See docs/transcribe-meeting.md for how to create the token."
)


# The app keeps its own transcript.json and the user's speaker edits in the
# meeting folder, so these names must never match the app's files.
OUTPUT_NAMES = ("speakers-transcript.md", "speakers-transcript.json")


def main() -> int:
    """Read one meeting, run the models, and write the output files."""
    args = parse_args(sys.argv[1:])
    if bool(args.wav) == bool(args.meeting):
        print(
            "Give a meeting folder, or --wav FILE with --out DIR.",
            file=sys.stderr,
        )
        return 2
    if (args.wav and not args.out) or (args.meeting and args.out):
        print("--out DIR belongs with --wav FILE.", file=sys.stderr)
        return 2
    out_dir = Path(args.out or args.meeting)
    existing = [out_dir / n for n in OUTPUT_NAMES if (out_dir / n).exists()]
    if existing and not args.force:
        print(
            f"{existing[0]} already exists. Add --force to replace it.",
            file=sys.stderr,
        )
        return 1
    print_progress("Loading audio.")
    if args.wav:
        audio = decode_audio(Path(args.wav))
    else:
        audio = load_meeting_audio(Path(args.meeting))
    if audio.size == 0:
        print("Found no audio chunks to transcribe.", file=sys.stderr)
        return 1
    token = os.environ.get("HF_TOKEN")
    if not token:
        print(MISSING_TOKEN_MESSAGE, file=sys.stderr)
        return 1
    segments, diar_turns = transcribe(audio, token)
    hyp_path = Path(args.hyp) if args.hyp else None
    write_results(out_dir, segments, diar_turns, hyp_path)
    return 0


def load_meeting_audio(folder: Path) -> np.ndarray:
    """Mix a meeting folder's two tracks into one 16 kHz mono array.

    Each chunk is placed by its clock time, relative to the earliest
    chunk of either track, so gaps stay silent. Returns an empty array
    when the folder has no readable chunks.
    """
    placed: list[tuple[int, np.ndarray]] = []
    for track in TRACK_DIRS:
        track_dir = folder / "audio" / track
        for start_ns, chunk_path in read_track_chunks(track_dir):
            placed.append((start_ns, decode_audio(chunk_path)))
    if not placed:
        return np.zeros(0, dtype=np.float32)
    base_ns = min(start_ns for start_ns, _ in placed)
    ends = [
        to_sample_index(start_ns, base_ns) + len(samples)
        for start_ns, samples in placed
    ]
    mix = np.zeros(max(ends), dtype=np.float32)
    for start_ns, samples in placed:
        start = to_sample_index(start_ns, base_ns)
        stop = min(start + len(samples), mix.size)
        mix[start:stop] += samples[: stop - start]
    return np.clip(mix, -1.0, 1.0)


def transcribe(
    audio: np.ndarray, hf_token: str
) -> tuple[list[dict], list[dict]]:
    """Transcribe, align, and diarize audio with WhisperX on CPU.

    Returns the word-aligned segments and the diarization turns as
    plain records. whisperx and torch import here so module import
    stays cheap for the tests.
    """
    import whisperx
    from whisperx.diarize import DiarizationPipeline

    print_progress("Transcribing with large-v3-turbo.")
    model = whisperx.load_model(
        "large-v3-turbo", "cpu", compute_type="int8", language="en"
    )
    result = model.transcribe(audio, batch_size=8)
    del model

    print_progress("Aligning word timestamps.")
    align_model, align_metadata = whisperx.load_align_model(
        language_code="en", device="cpu"
    )
    result = whisperx.align(
        result["segments"], align_model, align_metadata, audio, "cpu"
    )
    del align_model

    print_progress("Diarizing speakers.")
    pipeline = DiarizationPipeline(
        model_name=DIARIZATION_MODEL, token=hf_token, device="cpu"
    )
    diarize_df = pipeline(audio)
    result = whisperx.assign_word_speakers(diarize_df, result)
    return result["segments"], diarize_df.to_dict("records")


def format_transcript(segments: list[dict]) -> str:
    """Render transcript markdown with one line per speaker turn.

    Each turn line is timed at its first segment, like
    [HH:MM:SS] SPEAKER_00: text. Segments with no speaker label use
    UNKNOWN.
    """
    lines = ["# Transcript"]
    for start, speaker, text in collect_turns(segments):
        lines.append(f"[{format_clock(start)}] {speaker}: {text}")
    return "\n".join(lines) + "\n"


def collect_turns(segments: list[dict]) -> list[tuple[float, str, str]]:
    """Group consecutive segments that share one speaker into turns.

    Returns (start, speaker, joined text) triples in input order.
    """
    turns: list[tuple[float, str, list[str]]] = []
    for segment in segments:
        speaker = str(segment.get("speaker") or "UNKNOWN")
        text = str(segment.get("text", "")).strip()
        if turns and turns[-1][1] == speaker:
            start, _, parts = turns[-1]
            turns[-1] = (start, speaker, parts + [text])
        else:
            turns.append((float(segment.get("start") or 0.0), speaker, [text]))
    return [
        (start, speaker, " ".join(part for part in parts if part))
        for start, speaker, parts in turns
    ]


def format_clock(seconds: float) -> str:
    """Format a time as HH:MM:SS, rounded down to the second."""
    hours, rest = divmod(int(seconds), 3600)
    minutes, secs = divmod(rest, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def format_hyp(turns: list[dict]) -> str:
    """Render diarization turns in the score_der.py hypothesis format."""
    lines = [
        f"{float(turn['start']):.3f} {float(turn['end']):.3f} "
        f"{turn['speaker']}"
        for turn in turns
    ]
    return "\n".join(lines) + "\n"


def write_results(
    out_dir: Path,
    segments: list[dict],
    turns: list[dict],
    hyp_path: Path | None,
) -> None:
    """Write the two OUTPUT_NAMES files, plus hyp when given."""
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / OUTPUT_NAMES[0]
    md_path.write_text(format_transcript(segments), encoding="utf-8")
    json_path = out_dir / OUTPUT_NAMES[1]
    payload = json.dumps(segments, indent=2, ensure_ascii=False) + "\n"
    json_path.write_text(payload, encoding="utf-8")
    print_progress(f"Wrote {md_path}")
    print_progress(f"Wrote {json_path}")
    if hyp_path is not None:
        hyp_path.write_text(format_hyp(turns), encoding="utf-8")
        print_progress(f"Wrote {hyp_path}")


def decode_audio(path: Path) -> np.ndarray:
    """Decode one audio file into 16 kHz mono float32 samples."""
    planes: list[np.ndarray] = []
    with av.open(str(path)) as container:
        resampler = av.AudioResampler(
            format="flt", layout="mono", rate=SAMPLE_RATE
        )
        for frame in container.decode(audio=0):
            resampled = resampler.resample(frame) or []
            planes.extend(out.to_ndarray().reshape(-1) for out in resampled)
        # On PyAV 19 the only way to flush the resampler is None input.
        flushed = resampler.resample(None) or []
        planes.extend(out.to_ndarray().reshape(-1) for out in flushed)
    if not planes:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(planes).astype(np.float32)


def read_track_chunks(track_dir: Path) -> list[tuple[int, Path]]:
    """List (clock start, file) pairs from a track folder's chunks.json.

    A missing folder or an empty chunk list is fine, as either track
    can be absent for a whole meeting.
    """
    index_path = track_dir / "chunks.json"
    if not index_path.is_file():
        return []
    data = json.loads(index_path.read_text(encoding="utf-8"))
    chunks: list[tuple[int, Path]] = []
    for chunk in data.get("chunks", []):
        chunk_path = track_dir / str(chunk.get("file", ""))
        if str(chunk.get("file", "")) and chunk_path.is_file():
            chunks.append((int(chunk["startNs"]), chunk_path))
    return chunks


def to_sample_index(start_ns: int, base_ns: int) -> int:
    """Convert a chunk clock time to a sample index in the mix."""
    return round((start_ns - base_ns) * SAMPLE_RATE / 1e9)


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Build the two usage forms of the command line."""
    parser = argparse.ArgumentParser(
        description="Transcribe a meeting folder or one audio file."
    )
    parser.add_argument(
        "meeting", nargs="?", help="meeting folder made by the app"
    )
    parser.add_argument("--wav", help="transcribe one audio file instead")
    parser.add_argument("--out", help="output folder, needs --wav")
    parser.add_argument(
        "--hyp", help="also write diarization turns to this file"
    )
    parser.add_argument(
        "--force", action="store_true", help="replace earlier output files"
    )
    return parser.parse_args(argv)


def print_progress(message: str) -> None:
    """Report one step on stderr, keeping stdout clean."""
    print(message, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
