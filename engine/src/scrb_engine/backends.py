"""Loaders for each runtime in ``models.toml``, and Silero VAD.

Each loader imports its packages inside the function, so a missing extra
raises ``ImportError`` only when that model loads.
"""

import os
import sys
from collections.abc import Callable
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import numpy as np

from scrb_engine import EngineError
from scrb_engine.audio import SAMPLE_RATE

PARAKEET_LIMIT_S = 20.0
WHISPER_LIMIT_S = 30.0
GRANITE_LIMIT_S = 120.0
GRANITE_PROMPT = (
    "<|audio|>transcribe the speech with proper punctuation and "
    "capitalization."
)


@dataclass(frozen=True)
class Asr:
    """A loaded speech model, which takes at most ``limit_s`` per call."""

    transcribe: Callable[[np.ndarray], str]
    device: str
    dtype: str
    limit_s: float


@dataclass(frozen=True)
class Diarizer:
    """A loaded diarizer, which returns ``diarize``'s turns for samples."""

    diarize: Callable[[np.ndarray], list[dict]]
    device: str


def list_devices() -> list[str]:
    """Return ``cpu`` plus ``cuda`` and ``mps`` when torch finds them."""
    import torch

    devices = ["cpu"]
    if torch.cuda.is_available():
        devices.append("cuda")
    if torch.backends.mps.is_available():
        devices.append("mps")
    return devices


def pick_device(device: str) -> str:
    """Turn ``auto`` into cuda, else mps, else cpu; keep any other name."""
    if device != "auto":
        return device
    devices = list_devices()
    for preferred in ("cuda", "mps"):
        if preferred in devices:
            return preferred
    return "cpu"


def load_parakeet(folder: Path, device: str) -> Asr:
    """Load Parakeet's sherpa-onnx int8 export, which runs on the CPU."""
    import sherpa_onnx

    recognizer = sherpa_onnx.OfflineRecognizer.from_transducer(
        encoder=str(folder / "encoder.int8.onnx"),
        decoder=str(folder / "decoder.int8.onnx"),
        joiner=str(folder / "joiner.int8.onnx"),
        tokens=str(folder / "tokens.txt"),
        model_type="nemo_transducer",
        num_threads=os.cpu_count() or 1,
    )

    def transcribe(samples: np.ndarray) -> str:
        """Decode one piece of at most 20 s."""
        stream = recognizer.create_stream()
        stream.accept_waveform(SAMPLE_RATE, samples)
        recognizer.decode_stream(stream)
        return stream.result.text.strip()

    # The export's README says decoding long audio whole degrades badly and
    # advises 15-20 s chunks split at silences.
    return Asr(transcribe, "cpu", "int8", PARAKEET_LIMIT_S)


def load_whisper(folder: Path, device: str) -> Asr:
    """Load Whisper on CUDA in float16, else on the CPU in int8."""
    from faster_whisper import WhisperModel

    if device != "cpu":
        try:
            model = WhisperModel(
                str(folder), device="cuda", compute_type="float16"
            )
            # Missing CUDA libraries can surface only at the first call.
            _transcribe_whisper(model, np.zeros(SAMPLE_RATE, dtype=np.float32))
            transcribe = partial(_transcribe_whisper, model)
            return Asr(transcribe, "cuda", "float16", WHISPER_LIMIT_S)
        except (RuntimeError, ValueError) as error:
            print(
                f"scrb-engine: Whisper falls back to CPU int8 ({error})",
                file=sys.stderr,
            )
    model = WhisperModel(str(folder), device="cpu", compute_type="int8")
    transcribe = partial(_transcribe_whisper, model)
    return Asr(transcribe, "cpu", "int8", WHISPER_LIMIT_S)


def _transcribe_whisper(model, samples: np.ndarray) -> str:
    """Transcribe one piece with Whisper and join its segments' texts."""
    segments, _ = model.transcribe(samples, condition_on_previous_text=False)
    texts = (segment.text.strip() for segment in segments)
    return " ".join(text for text in texts if text)


def load_granite(folder: Path, device: str) -> Asr:
    """Load Granite Speech in bf16, the precision it ships in."""
    import torch
    from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

    device = pick_device(device)
    processor = AutoProcessor.from_pretrained(folder)
    model = AutoModelForSpeechSeq2Seq.from_pretrained(
        folder, dtype=torch.bfloat16
    ).to(device)
    chat = [{"role": "user", "content": GRANITE_PROMPT}]
    prompt = processor.tokenizer.apply_chat_template(
        chat, tokenize=False, add_generation_prompt=True
    )

    def transcribe(samples: np.ndarray) -> str:
        """Decode one piece of at most 120 s, greedily."""
        inputs = processor(
            prompt, samples, device=device, return_tensors="pt"
        ).to(device)
        with torch.inference_mode():
            output = model.generate(
                **inputs, max_new_tokens=1024, do_sample=False, num_beams=1
            )
        new_tokens = output[:, inputs["input_ids"].shape[1] :]
        texts = processor.tokenizer.batch_decode(
            new_tokens, skip_special_tokens=True
        )
        return texts[0].strip()

    return Asr(transcribe, device, "bfloat16", GRANITE_LIMIT_S)


def load_pyannote(folder: Path, device: str) -> Diarizer:
    """Load the pyannote pipeline whose ``config.yaml`` is in ``folder``."""
    import torch
    from pyannote.audio import Pipeline

    device = pick_device(device)
    pipeline = Pipeline.from_pretrained(folder)
    if pipeline is None:
        raise EngineError("internal", f"pyannote could not load {folder}")
    pipeline.to(torch.device(device))

    def diarize(samples: np.ndarray) -> list[dict]:
        """Return non-overlapping turns, with times in seconds."""
        waveform = torch.from_numpy(samples).unsqueeze(0)
        output = pipeline({"waveform": waveform, "sample_rate": SAMPLE_RATE})
        tracks = output.exclusive_speaker_diarization.itertracks(
            yield_label=True
        )
        return [
            {
                "start": round(turn.start, 3),
                "end": round(turn.end, 3),
                "speaker": speaker,
            }
            for turn, _, speaker in tracks
        ]

    return Diarizer(diarize, device)


RUNTIMES = {
    "sherpa-onnx": load_parakeet,
    "faster-whisper": load_whisper,
    "transformers": load_granite,
    "pyannote": load_pyannote,
}


class SileroVad:
    """Silero VAD, whose weights come inside the silero-vad wheel."""

    def __init__(self) -> None:
        """Load the model once, for ``find_spans`` and every stream."""
        from silero_vad import load_silero_vad

        self.model = load_silero_vad()

    def find_spans(self, samples: np.ndarray) -> list[list[float]]:
        """Return the speech in the samples as ``[start, end]`` seconds."""
        import torch
        from silero_vad import get_speech_timestamps

        stamps = get_speech_timestamps(
            torch.from_numpy(samples),
            self.model,
            sampling_rate=SAMPLE_RATE,
            return_seconds=True,
            time_resolution=3,
        )
        return [[stamp["start"], stamp["end"]] for stamp in stamps]

    def start_iterator(self):
        """Return a new ``VADIterator``, which takes 512-sample windows."""
        from silero_vad import VADIterator

        return VADIterator(self.model, sampling_rate=SAMPLE_RATE)
