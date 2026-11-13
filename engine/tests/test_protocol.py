"""The protocol ops, sent as lines to a ``Worker`` with a stub speech model.

Silero VAD is real in every test. Parakeet, Whisper and Granite never load;
only pyannote does, in the diarize test, when its weights are fetched.
"""

import base64
import json
import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pytest
import soundfile

from scrb_engine.audio import SAMPLE_RATE
from scrb_engine.backends import RUNTIMES, Asr
from scrb_engine.main import Worker
from scrb_engine.models import Model, find_models_dir, is_present, read_catalog

REPO_ROOT = Path(__file__).resolve().parents[2]
# 11 s of one speaker at 16 kHz mono, from whisper.cpp's samples.
SPEECH_WAV = REPO_ROOT / "packages/transcription/test/fixtures/speech.wav"
TONES_8KHZ_WAV = REPO_ROOT / "crates/scrb/tests/data/two-speakers.wav"
STUB_MODEL = Model(name="stub", kind="asr", runtime="stub")
STUB_LIMIT_S = 10.0


class OutOfMemoryError(RuntimeError):
    """Stands in for PyTorch's error of the same name."""


@dataclass
class StubAsr:
    """A speech model that records each piece it gets and says "words"."""

    pieces: list[np.ndarray] = field(default_factory=list)
    error: Exception | None = None

    def transcribe(self, samples: np.ndarray) -> str:
        """Record the piece, then raise ``error`` or return "words"."""
        self.pieces.append(samples)
        if self.error is not None:
            raise self.error
        return "words"


def make_stub_runtimes(stub_asr: StubAsr) -> dict:
    """Return the real runtimes plus ``stub``, which loads ``stub_asr``."""

    def load_stub(folder: Path, device: str) -> Asr:
        """Load the stub with a 10 s limit."""
        return Asr(stub_asr.transcribe, "cpu", "float32", STUB_LIMIT_S)

    return {**RUNTIMES, "stub": load_stub}


def fail_import(folder: Path, device: str) -> Asr:
    """Stand in for a loader whose model's extra is not installed."""
    raise ImportError("No module named 'sherpa_onnx'")


def send(worker: Worker, request: dict) -> None:
    """Send one request as a protocol line."""
    worker.handle_line(json.dumps(request))


@pytest.fixture
def stub_asr() -> StubAsr:
    """A stub speech model shared by the worker and the test."""
    return StubAsr()


@pytest.fixture
def replies() -> list[dict]:
    """Every line the worker sends, in order."""
    return []


@pytest.fixture
def worker(tmp_path: Path, stub_asr: StubAsr, replies: list[dict]) -> Worker:
    """A worker with the stub speech model loaded."""
    catalog = {"stub": STUB_MODEL}
    worker = Worker(
        catalog, tmp_path, replies.append, make_stub_runtimes(stub_asr)
    )
    send(worker, {"id": 1, "op": "load", "asr": "stub", "device": "cpu"})
    return worker


def test_hello_marks_only_silero_present(tmp_path, replies):
    """``hello`` lists every model, and only Silero VAD is present at first.

    ``scrb models list`` shows this, so a model whose files were never
    fetched must read as missing, and the voice detector, which comes with
    the engine, as present.
    """
    worker = Worker(read_catalog(), tmp_path, replies.append)

    send(worker, {"id": 1, "op": "hello"})

    (reply,) = replies
    present = {model["name"]: model["present"] for model in reply["models"]}
    assert present == {
        "parakeet-tdt-0.6b-v3": False,
        "whisper-large-v3-turbo": False,
        "granite-speech-2b": False,
        "pyannote-community-1": False,
        "silero-vad": True,
    }
    assert "cpu" in reply["devices"]


def test_transcribe_cuts_long_span_in_gap(worker, stub_asr, replies, tmp_path):
    """A span longer than the model's limit is cut at its quiet gap.

    Cutting inside a word would garble it, and a piece over the limit
    degrades the model's text, so the cut must land in the 0.3 s gap and the
    pieces' texts come back as one text for the span.
    """
    rng = np.random.default_rng(0)
    noise = rng.uniform(-0.5, 0.5, 14 * SAMPLE_RATE).astype(np.float32)
    noise[7 * SAMPLE_RATE : round(7.3 * SAMPLE_RATE)] = 0.0
    audio = tmp_path / "gap.wav"
    soundfile.write(audio, noise, SAMPLE_RATE)

    send(
        worker,
        {"id": 2, "op": "transcribe", "audio": str(audio), "spans": [[0, 14]]},
    )

    assert replies[-1] == {"id": 2, "ok": True, "texts": ["words words"]}
    first, second = (len(piece) / SAMPLE_RATE for piece in stub_asr.pieces)
    assert 7.0 < first < 7.3
    assert first + second == pytest.approx(14.0)


def test_stream_sends_segments_for_speech(worker, replies):
    """Fed speech comes back as segments on the first feed's timeline.

    Live notes show these segments while the meeting runs, so speech must
    produce at least one, timed from the first feed's ``t``, and both stream
    requests must be answered.
    """
    samples, _ = soundfile.read(SPEECH_WAV, dtype="int16")
    chunk = SAMPLE_RATE // 10

    send(worker, {"id": 2, "op": "stream_start", "rate": SAMPLE_RATE})
    for offset in range(0, len(samples), chunk):
        pcm = samples[offset : offset + chunk].astype("<i2").tobytes()
        t = 100.0 + offset / SAMPLE_RATE
        send(
            worker,
            {"op": "feed", "t": t, "pcm": base64.b64encode(pcm).decode()},
        )
    send(worker, {"id": 3, "op": "stream_end"})

    segments = [line for line in replies if line.get("event") == "segment"]
    assert segments
    assert all(100.0 <= s["start"] < s["end"] <= 111.0 for s in segments)
    assert {"id": 2, "ok": True} in replies
    assert replies[-1] == {"id": 3, "ok": True}


def test_diarize_returns_turns_without_ffmpeg(stub_asr, replies, monkeypatch):
    """``diarize`` finds turns with nothing on PATH.

    The engine gives pyannote the waveform itself, so a machine without
    FFmpeg must still get speakers. Skips until the pyannote-community-1
    extra and weights are installed.
    """
    pytest.importorskip(
        "pyannote.audio", reason="needs the pyannote-community-1 extra"
    )
    catalog = {**read_catalog(), "stub": STUB_MODEL}
    models_dir = find_models_dir()
    if not is_present(catalog["pyannote-community-1"], models_dir):
        pytest.skip("run scrb models fetch --model pyannote-community-1")
    monkeypatch.setenv("PATH", "")
    worker = Worker(
        catalog, models_dir, replies.append, make_stub_runtimes(stub_asr)
    )

    send(
        worker,
        {
            "id": 1,
            "op": "load",
            "asr": "stub",
            "diarizer": "pyannote-community-1",
            "device": "cpu",
        },
    )
    send(worker, {"id": 2, "op": "diarize", "audio": str(SPEECH_WAV)})

    assert replies[-1]["ok"] is True, replies[-1]
    assert replies[-1]["turns"]


@pytest.mark.parametrize(
    ("catalog", "runtimes", "name"),
    [
        pytest.param(
            read_catalog(), RUNTIMES, "parakeet-tdt-0.6b-v3", id="not-fetched"
        ),
        pytest.param(
            {"stub": STUB_MODEL}, {"stub": fail_import}, "stub", id="no-extra"
        ),
    ],
)
def test_load_reports_model_missing(
    catalog, runtimes, name, tmp_path, replies
):
    """``load`` answers ``model_missing`` when weights or packages are absent.

    scrb turns this code into the hint to run ``scrb models fetch``, which
    installs both, so neither case may surface as ``internal``.
    """
    worker = Worker(catalog, tmp_path, replies.append, runtimes)

    send(worker, {"id": 1, "op": "load", "asr": name, "device": "cpu"})

    assert replies[-1]["id"] == 1
    assert replies[-1]["error"]["code"] == "model_missing"


@pytest.mark.parametrize(
    ("line", "request_id"),
    [
        pytest.param("not json", None, id="not-json"),
        pytest.param('{"id": 4, "op": "load"}', 4, id="missing-field"),
        pytest.param('{"id": 5, "op": "dance"}', 5, id="unknown-op"),
    ],
)
def test_handle_line_rejects_malformed_request(
    worker, replies, line, request_id
):
    """A malformed request gets ``bad_request`` and the worker keeps going.

    scrb restarts a worker that writes a broken line, so a bad request must
    get one error reply with its id, or a null id when there is none.
    """
    worker.handle_line(line)

    assert replies[-1]["id"] == request_id
    assert replies[-1]["error"]["code"] == "bad_request"


@pytest.mark.parametrize(
    ("audio", "error", "code"),
    [
        pytest.param(TONES_8KHZ_WAV, None, "bad_audio", id="8-khz-audio"),
        pytest.param(
            SPEECH_WAV,
            OutOfMemoryError("CUDA out of memory"),
            "out_of_memory",
            id="out-of-memory",
        ),
        pytest.param(SPEECH_WAV, ValueError("bad"), "internal", id="other"),
    ],
)
def test_transcribe_maps_failures_to_error_codes(
    worker, stub_asr, replies, audio, error, code
):
    """A failed ``transcribe`` gets the protocol's code for its cause.

    The codes tell the user what to do, such as giving 16 kHz mono audio or
    picking a smaller model, so each cause must keep its own code.
    """
    stub_asr.error = error

    send(
        worker,
        {"id": 2, "op": "transcribe", "audio": str(audio), "spans": [[0, 1]]},
    )

    assert replies[-1]["id"] == 2
    assert replies[-1]["error"]["code"] == code


def test_scrb_engine_command_answers_hello():
    """The ``scrb-engine`` command that scrb starts answers on stdout.

    scrb reads every stdout line as protocol, so the installed command must
    answer ``hello`` with exactly one JSON line there.
    """
    bin_dir = str(Path(sys.executable).parent)
    command = shutil.which("scrb-engine", path=bin_dir)

    result = subprocess.run(
        [command],
        input='{"id": 1, "op": "hello"}\n',
        capture_output=True,
        text=True,
        timeout=120,
        check=True,
    )

    (line,) = result.stdout.splitlines()
    assert json.loads(line)["ok"] is True
