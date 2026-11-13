"""Reading the engine's WAV input and cutting long spans into pieces."""

import numpy as np
import soundfile

from scrb_engine import EngineError

SAMPLE_RATE = 16000
FRAME_S = 0.1


def read_wav(path: str) -> np.ndarray:
    """Read a 16 kHz mono WAV as float32 samples, else raise ``bad_audio``."""
    try:
        info = soundfile.info(path)
        if info.samplerate != SAMPLE_RATE or info.channels != 1:
            raise EngineError(
                "bad_audio",
                f"{path} is {info.samplerate} Hz with {info.channels} "
                "channels, not 16 kHz mono",
            )
        samples, _ = soundfile.read(path, dtype="float32")
    except soundfile.SoundFileError as error:
        raise EngineError("bad_audio", f"{path}: {error}") from error
    return samples


def split_span(
    samples: np.ndarray, start_s: float, end_s: float, limit_s: float
) -> list[np.ndarray]:
    """Cut the span's samples into pieces of at most ``limit_s`` seconds.

    Each cut falls at the centre of the quietest 100 ms frame between half
    the limit and the limit from the piece's start. A span past the end of
    the audio gives one empty piece.
    """
    start = max(0, round(start_s * SAMPLE_RATE))
    end = min(len(samples), round(end_s * SAMPLE_RATE))
    limit = round(limit_s * SAMPLE_RATE)
    pieces = []
    while end - start > limit:
        cut = _find_quietest_point(samples, start + limit // 2, start + limit)
        pieces.append(samples[start:cut])
        start = cut
    pieces.append(samples[start:end])
    return pieces


def _find_quietest_point(samples: np.ndarray, low: int, high: int) -> int:
    """Return the centre of the quietest whole frame in ``[low, high)``."""
    frame = round(FRAME_S * SAMPLE_RATE)
    count = (high - low) // frame
    frames = samples[low : low + count * frame].reshape(count, frame)
    energies = np.square(frames).sum(axis=1)
    return low + int(np.argmin(energies)) * frame + frame // 2
