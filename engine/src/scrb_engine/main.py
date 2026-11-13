"""The protocol loop, the ``Worker`` that answers each request, and fetch.

``scrb-engine`` answers protocol lines on stdin until stdin closes.
``scrb-engine fetch MODEL`` downloads one model and prints one JSON line.
"""

import argparse
import base64
import binascii
import importlib.metadata
import json
import os
import sys
import threading
import time
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from scrb_engine import EngineError
from scrb_engine.audio import SAMPLE_RATE, read_wav, split_span
from scrb_engine.backends import (
    RUNTIMES,
    Asr,
    Diarizer,
    SileroVad,
    list_devices,
)
from scrb_engine.models import (
    Model,
    fetch,
    find_models_dir,
    is_present,
    read_catalog,
)

DEVICES = ("auto", "cpu", "cuda", "mps")
# Silero VAD takes 512-sample windows at 16 kHz.
WINDOW = 512
PRE_ROLL = SAMPLE_RATE // 2
SEGMENT_LIMIT = 15 * SAMPLE_RATE
ALIVE_EVERY_S = 5.0

Send = Callable[[dict], None]
Loader = Callable[[Path, str], Asr | Diarizer]


@dataclass
class _Stream:
    """An open stream, with sample numbers counted from its first feed."""

    iterator: Callable[[np.ndarray], dict | None]
    stop_alive: threading.Event
    alive: threading.Thread
    t0: float | None = None
    audio: np.ndarray = field(
        default_factory=lambda: np.zeros(0, dtype=np.float32)
    )
    audio_start: int = 0
    fed: int = 0
    speech_start: int | None = None


class Worker:
    """Answers protocol requests one at a time.

    ``send`` writes one protocol line, and ``runtimes`` maps a
    ``models.toml`` runtime to its loader, so tests can pass a stub.
    """

    def __init__(
        self,
        catalog: dict[str, Model],
        models_dir: Path,
        send: Send,
        runtimes: dict[str, Loader] = RUNTIMES,
    ) -> None:
        """Hold the catalog and the models folder; nothing loads yet."""
        self.catalog = catalog
        self.models_dir = models_dir
        self.runtimes = runtimes
        self._send_line = send
        self._send_lock = threading.Lock()
        self._asr: Asr | None = None
        self._diarizer: Diarizer | None = None
        self._vad: SileroVad | None = None
        self._stream: _Stream | None = None
        self._ops = {
            "hello": self._answer_hello,
            "load": self._load,
            "diarize": self._diarize,
            "vad": self._find_speech,
            "transcribe": self._transcribe,
            "stream_start": self._start_stream,
            "feed": self._feed,
            "stream_end": self._end_stream,
        }

    def handle_line(self, line: str) -> None:
        """Answer one request line, sending a failure as an error reply."""
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            request = None
        if not isinstance(request, dict):
            error = EngineError("bad_request", "the line is not a JSON object")
            self._send_error(None, error)
            return
        op = request.get("op")
        # Feed lines carry no id, so their errors go out with a null id.
        request_id = None if op == "feed" else request.get("id")
        try:
            handler = self._ops.get(op) if isinstance(op, str) else None
            if handler is None:
                raise EngineError("bad_request", f"unknown op {op!r}")
            reply = handler(request_id, request)
        except EngineError as error:
            self._send_error(request_id, error)
        except Exception as error:
            traceback.print_exc()
            self._send_error(request_id, _classify_error(error))
        else:
            if reply is not None:
                self.send({"id": request_id, "ok": True, **reply})

    def send(self, line: dict) -> None:
        """Write one protocol line; the alive thread writes too."""
        with self._send_lock:
            self._send_line(line)

    def close(self) -> None:
        """Stop the alive thread of a stream left open."""
        if self._stream is not None:
            _stop_alive(self._stream)
            self._stream = None

    def _answer_hello(self, request_id: object, request: dict) -> dict:
        """Name the engine's version, every model and the devices."""
        models = [
            {
                "name": model.name,
                "kind": model.kind,
                "present": is_present(model, self.models_dir),
            }
            for model in self.catalog.values()
        ]
        return {
            "engine_version": importlib.metadata.version("scrb-engine"),
            "models": models,
            "devices": list_devices(),
        }

    def _load(self, request_id: object, request: dict) -> dict:
        """Load the speech model and, unless it is null, the diarizer."""
        asr_name = _require_field(request, "asr", str)
        diarizer_name = request.get("diarizer")
        if diarizer_name is not None and not isinstance(diarizer_name, str):
            raise EngineError("bad_request", "diarizer must be a name or null")
        device = request.get("device", "auto")
        if device not in DEVICES:
            raise EngineError("bad_request", f"unknown device {device!r}")
        started = time.monotonic()
        asr = self._load_model(asr_name, "asr", device)
        diarizer = None
        if diarizer_name is not None:
            diarizer = self._load_model(diarizer_name, "diarizer", device)
        self._asr, self._diarizer = asr, diarizer
        return {
            "device": asr.device,
            "dtype": asr.dtype,
            "load_s": round(time.monotonic() - started, 3),
        }

    def _load_model(self, name: str, kind: str, device: str):
        """Load one fetched model of ``kind`` through its runtime."""
        model = self.catalog.get(name)
        if model is None or model.kind != kind:
            raise EngineError("bad_request", f"{name} is not a {kind} model")
        if not is_present(model, self.models_dir):
            raise EngineError("model_missing", name)
        loader = self.runtimes[model.runtime]
        try:
            return loader(self.models_dir / model.dir, device)
        except ImportError as error:
            raise EngineError(
                "model_missing",
                f"{name}, whose packages are missing ({error})",
            ) from error

    def _diarize(self, request_id: object, request: dict) -> dict:
        """Return the loaded diarizer's turns for the audio."""
        if self._diarizer is None:
            raise EngineError("bad_request", "no diarizer is loaded")
        samples = read_wav(_require_field(request, "audio", str))
        return {"turns": self._diarizer.diarize(samples)}

    def _find_speech(self, request_id: object, request: dict) -> dict:
        """Return Silero VAD's speech spans; no load is needed."""
        samples = read_wav(_require_field(request, "audio", str))
        return {"spans": self._load_silero().find_spans(samples)}

    def _transcribe(self, request_id: object, request: dict) -> dict:
        """Return one text per span, with a progress line after each."""
        if self._asr is None:
            raise EngineError("bad_request", "no speech model is loaded")
        samples = read_wav(_require_field(request, "audio", str))
        spans = _require_spans(request)
        texts = []
        for done, (start_s, end_s) in enumerate(spans, start=1):
            pieces = split_span(samples, start_s, end_s, self._asr.limit_s)
            piece_texts = [self._asr.transcribe(p) for p in pieces if len(p)]
            texts.append(" ".join(text for text in piece_texts if text))
            progress = {"done": done, "total": len(spans)}
            self.send({"id": request_id, "progress": progress})
        return {"texts": texts}

    def _start_stream(self, request_id: object, request: dict) -> dict:
        """Open a stream, whose segments go out as events."""
        if self._asr is None:
            raise EngineError("bad_request", "no speech model is loaded")
        if self._stream is not None:
            raise EngineError("bad_request", "a stream is already open")
        if request.get("rate") != SAMPLE_RATE:
            raise EngineError("bad_request", "rate must be 16000")
        stop_alive = threading.Event()
        alive = threading.Thread(
            target=self._send_alive, args=(stop_alive,), daemon=True
        )
        iterator = self._load_silero().start_iterator()
        self._stream = _Stream(iterator, stop_alive, alive)
        alive.start()
        return {}

    def _feed(self, request_id: object, request: dict) -> None:
        """Pass fed s16le audio to Silero; a feed gets no reply.

        Fed audio is taken as continuous, so segment times count samples
        from the first feed's ``t``.
        """
        stream = self._stream
        if stream is None:
            raise EngineError("bad_request", "no stream is open")
        t = _require_field(request, "t", (int, float))
        pcm = _require_field(request, "pcm", str)
        try:
            raw = base64.b64decode(pcm, validate=True)
        except binascii.Error as error:
            raise EngineError("bad_request", f"pcm: {error}") from error
        if len(raw) % 2:
            raise EngineError("bad_request", "pcm has an odd number of bytes")
        if stream.t0 is None:
            stream.t0 = float(t)
        samples = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768
        stream.audio = np.concatenate([stream.audio, samples])
        while stream.audio_start + len(stream.audio) - stream.fed >= WINDOW:
            self._step_stream(stream)
        return None

    def _end_stream(self, request_id: object, request: dict) -> dict:
        """Send open speech as a last segment, then close the stream."""
        stream = self._stream
        if stream is None:
            raise EngineError("bad_request", "no stream is open")
        self._stream = None
        _stop_alive(stream)
        if stream.speech_start is not None:
            self._send_segment(stream, stream.fed)
        return {}

    def _step_stream(self, stream: _Stream) -> None:
        """Pass the next window to Silero and end or cut a segment."""
        offset = stream.fed - stream.audio_start
        window = stream.audio[offset : offset + WINDOW]
        stream.fed += WINDOW
        event = stream.iterator(window) or {}
        if "start" in event and stream.speech_start is None:
            stream.speech_start = max(event["start"], stream.audio_start)
        elif "end" in event and stream.speech_start is not None:
            self._send_segment(stream, min(event["end"], stream.fed))
            stream.speech_start = None
        elif (
            stream.speech_start is not None
            and stream.fed - stream.speech_start >= SEGMENT_LIMIT
        ):
            self._send_segment(stream, stream.fed)
            stream.speech_start = stream.fed
        # Without open speech, keep 0.5 s, since Silero's start is padded
        # back from the window where it finds speech.
        if stream.speech_start is None:
            keep_from = stream.fed - PRE_ROLL
        else:
            keep_from = stream.speech_start
        if keep_from > stream.audio_start:
            stream.audio = stream.audio[keep_from - stream.audio_start :]
            stream.audio_start = keep_from

    def _send_segment(self, stream: _Stream, end: int) -> None:
        """Transcribe the open speech up to ``end`` and send its text."""
        start = stream.speech_start
        if end <= start:
            return
        offset = stream.audio_start
        text = self._asr.transcribe(
            stream.audio[start - offset : end - offset]
        )
        if text:
            self.send(
                {
                    "event": "segment",
                    "start": round(stream.t0 + start / SAMPLE_RATE, 3),
                    "end": round(stream.t0 + end / SAMPLE_RATE, 3),
                    "text": text,
                }
            )

    def _send_alive(self, stop: threading.Event) -> None:
        """Send an ``alive`` event every 5 s until ``stop`` is set."""
        while not stop.wait(ALIVE_EVERY_S):
            self.send({"event": "alive"})

    def _load_silero(self) -> SileroVad:
        """Load Silero VAD on first use."""
        if self._vad is None:
            self._vad = SileroVad()
        return self._vad

    def _send_error(self, request_id: object, error: EngineError) -> None:
        """Send an error reply with the error's code."""
        body = {"code": error.code, "message": error.message}
        self.send({"id": request_id, "ok": False, "error": body})


def main() -> None:
    """Serve the protocol, or with ``fetch MODEL``, download one model."""
    parser = argparse.ArgumentParser(
        prog="scrb-engine",
        description="Meeting Scribe's speech engine. With no command, it "
        "answers JSON-lines requests on stdin.",
    )
    commands = parser.add_subparsers(dest="command")
    fetch_command = commands.add_parser(
        "fetch", help="download one model's files and check their SHA-256"
    )
    fetch_command.add_argument("model")
    args = parser.parse_args()
    if args.command == "fetch":
        sys.exit(run_fetch(args.model))
    serve()


def run_fetch(name: str) -> int:
    """Fetch one model, print one JSON result line and return the exit code."""
    model = read_catalog().get(name)
    try:
        if model is None:
            raise EngineError("bad_request", f"{name} is not in models.toml")
        path = fetch(model, find_models_dir())
    except EngineError as error:
        body = {"code": error.code, "message": error.message}
        print(json.dumps({"ok": False, "error": body}))
        return 1
    path_text = None if path is None else str(path)
    print(json.dumps({"ok": True, "model": name, "path": path_text}))
    return 0


def serve() -> None:
    """Answer protocol lines on stdin until it closes."""
    # A library that prints to stdout would break the protocol, so fd 1 now
    # goes to stderr and replies use a private copy of it.
    protocol = os.fdopen(os.dup(1), "w", encoding="utf-8", newline="\n")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    # Requests are UTF-8 JSON whatever the system's locale is.
    sys.stdin.reconfigure(encoding="utf-8")

    def send(line: dict) -> None:
        """Write one reply line and flush it."""
        protocol.write(json.dumps(line) + "\n")
        protocol.flush()

    worker = Worker(read_catalog(), find_models_dir(), send)
    try:
        for line in sys.stdin:
            if line.strip():
                worker.handle_line(line)
    finally:
        worker.close()


def _classify_error(error: Exception) -> EngineError:
    """Map an unexpected exception to ``out_of_memory`` or ``internal``."""
    # PyTorch's OutOfMemoryError is not a MemoryError, so match its name.
    out_of_memory = type(error).__name__ == "OutOfMemoryError"
    if out_of_memory or isinstance(error, MemoryError):
        return EngineError("out_of_memory", str(error))
    return EngineError("internal", f"{type(error).__name__}: {error}")


def _require_field(request: dict, name: str, kinds: type | tuple) -> object:
    """Return ``request[name]``, else raise ``bad_request``."""
    value = request.get(name)
    if isinstance(value, bool) or not isinstance(value, kinds):
        raise EngineError("bad_request", f"{name} is missing or mistyped")
    return value


def _require_spans(request: dict) -> list[list[float]]:
    """Return the request's ``spans``, a list of ``[start, end]`` seconds."""
    spans = request.get("spans")
    if not isinstance(spans, list) or not all(
        isinstance(span, list)
        and len(span) == 2
        and all(_is_number(value) for value in span)
        for span in spans
    ):
        raise EngineError("bad_request", "spans must be [start, end] pairs")
    return spans


def _is_number(value: object) -> bool:
    """Tell whether ``value`` is a JSON number."""
    return isinstance(value, int | float) and not isinstance(value, bool)


def _stop_alive(stream: _Stream) -> None:
    """Stop a stream's alive thread and wait for it."""
    stream.stop_alive.set()
    stream.alive.join()
