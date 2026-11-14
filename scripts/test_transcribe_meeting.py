"""Checks for transcribe_meeting.py that need no machine-learning models.

These cover chunk placement in the mixed audio and transcript turn
formatting, the parts most likely to shift speech in time or hide who
spoke. The model path is exercised only by hand on a real machine.
"""

import importlib.util
import json
from pathlib import Path

import numpy as np

SCRIPT = Path(__file__).with_name("transcribe_meeting.py")
FIXTURE = (
    Path(__file__).parents[1]
    / "packages/transcription/test/fixtures/speech.opus"
)
BASE_NS = 5_000_000_000


def load_script():
    """The script as a module, loaded from its file path."""
    # scripts/ is not a package, so a plain import cannot find it.
    spec = importlib.util.spec_from_file_location("transcribe_meeting", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def make_track(track_dir: Path, chunks: list[dict]) -> None:
    """A track folder holding a chunks.json with the given chunks."""
    track_dir.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"chunks": chunks})
    (track_dir / "chunks.json").write_text(payload, encoding="utf-8")


def test_load_meeting_audio_places_chunk_offsets(tmp_path: Path) -> None:
    """Chunks land at their clock offsets with silence in the gap.

    Meeting audio arrives as timed chunks, so a wrong offset would
    drop, overlap, or reorder speech before any model hears it.
    """
    script = load_script()
    fixture = script.decode_audio(FIXTURE)
    # Second chunk starts 3 s (48000 samples) after the first ends.
    offset = len(fixture) + 48_000
    track = tmp_path / "audio" / "meeting"
    make_track(
        track,
        [
            {"file": "000001.opus", "startNs": BASE_NS},
            {"file": "000002.opus", "startNs": BASE_NS + offset * 62_500},
        ],
    )
    for name in ("000001.opus", "000002.opus"):
        (track / name).write_bytes(FIXTURE.read_bytes())
    make_track(tmp_path / "audio" / "microphone", [])
    mix = script.load_meeting_audio(tmp_path)
    assert abs(mix.size - (offset + len(fixture))) <= 320
    gap = mix[len(fixture) + 800 : offset - 800]
    assert float(np.max(np.abs(gap))) < 1e-4
    assert np.allclose(mix[: len(fixture)], fixture, atol=1e-3)
    second = mix[offset : offset + len(fixture)]
    assert np.allclose(second, fixture, atol=1e-3)


def test_load_meeting_audio_sums_both_tracks(tmp_path: Path) -> None:
    """Both tracks are added sample by sample and clipped to [-1, 1].

    One mixed stream is what the models receive, so a dropped or
    half-weighted track would silently lose one side of the meeting.
    """
    script = load_script()
    for track_name in ("microphone", "meeting"):
        track = tmp_path / "audio" / track_name
        make_track(track, [{"file": "000001.opus", "startNs": BASE_NS}])
        (track / "000001.opus").write_bytes(FIXTURE.read_bytes())
    mix = script.load_meeting_audio(tmp_path)
    fixture = script.decode_audio(FIXTURE)
    expected = np.clip(fixture + fixture, -1.0, 1.0)
    assert mix.dtype == np.float32
    assert np.array_equal(mix, expected)


def test_format_transcript_merges_same_speaker_segments() -> None:
    """Consecutive segments by one speaker print as a single turn.

    Readers follow the meeting through turn lines, so splitting one
    speaker across lines or misplacing the clock time hides who said
    what and when.
    """
    script = load_script()
    segments = [
        {"start": 0.0, "text": "first", "speaker": "SPEAKER_00"},
        {"start": 2.5, "text": "again", "speaker": "SPEAKER_00"},
        {"start": 3723.0, "text": "reply", "speaker": "SPEAKER_01"},
    ]
    lines = script.format_transcript(segments).splitlines()
    assert lines[0] == "# Transcript"
    assert lines[1] == "[00:00:00] SPEAKER_00: first again"
    assert lines[2] == "[01:02:03] SPEAKER_01: reply"
    assert len(lines) == 3


def test_main_refuses_to_replace_earlier_output(
    tmp_path: Path, monkeypatch, capsys
) -> None:
    """main stops before any work when its output file already exists.

    The meeting folder also holds the app's own files, so a rerun must
    never overwrite a transcript without --force.
    """
    earlier = tmp_path / "speakers-transcript.md"
    earlier.write_text("edited by hand", encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["transcribe_meeting.py", str(tmp_path)])

    code = load_script().main()

    assert code == 1
    assert earlier.read_text(encoding="utf-8") == "edited by hand"
    assert "--force" in capsys.readouterr().err
