"""The model catalog in ``models.toml`` and the models folder."""

import hashlib
import os
import sys
import tarfile
import tempfile
import tomllib
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from scrb_engine import EngineError

# The project is installed editable, so the source tree's files are here.
CATALOG_PATH = Path(__file__).resolve().parents[2] / "models.toml"
MARKER = ".scrb-fetched"


@dataclass(frozen=True)
class Pin:
    """One file of a model and the SHA-256 it must have."""

    url: str
    sha256: str

    @property
    def file_name(self) -> str:
        """The last part of the URL."""
        return self.url.rsplit("/", 1)[-1]


@dataclass(frozen=True)
class Model:
    """One ``[models.<name>]`` entry of ``models.toml``."""

    name: str
    kind: str
    runtime: str
    dir: str = ""
    archive: bool = False
    files: tuple[Pin, ...] = ()


def read_catalog(path: Path = CATALOG_PATH) -> dict[str, Model]:
    """Read every model in ``models.toml``, by name."""
    with path.open("rb") as file:
        entries = tomllib.load(file)["models"]
    return {
        name: Model(
            name=name,
            kind=entry["kind"],
            runtime=entry["runtime"],
            dir=entry.get("dir", ""),
            archive=entry.get("archive", False),
            files=tuple(
                Pin(pin["url"], pin["sha256"])
                for pin in entry.get("files", [])
            ),
        )
        for name, entry in entries.items()
    }


def find_models_dir() -> Path:
    """Return ``<data dir>/scrb/models``, by scrb's data folder rule.

    The data folder is ``~/Library/Application Support`` on macOS,
    ``%LOCALAPPDATA%`` on Windows, else ``$XDG_DATA_HOME`` or
    ``~/.local/share``, as in scrb's engine client.
    """
    if sys.platform == "darwin":
        data_dir = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        data_dir = Path(os.environ["LOCALAPPDATA"])
    else:
        default = Path.home() / ".local" / "share"
        data_dir = Path(os.environ.get("XDG_DATA_HOME", default))
    return data_dir / "scrb" / "models"


def is_present(model: Model, models_dir: Path) -> bool:
    """Tell whether the model's folder holds the files of its current pins.

    A model without files, such as Silero VAD, whose weights come in its
    wheel, is always present.
    """
    if not model.files:
        return True
    marker = models_dir / model.dir / MARKER
    try:
        return marker.read_text(encoding="utf-8") == _format_marker(model)
    except OSError:
        return False


def fetch(model: Model, models_dir: Path) -> Path | None:
    """Download and check the model's files unless it is present.

    Returns the model's folder, or ``None`` for a model without files. The
    files land in a temporary folder inside ``models_dir``, and the model's
    folder appears only after every SHA-256 matched, so a failed fetch
    leaves the model missing. A folder left from older pins is replaced.
    """
    if not model.files:
        return None
    target = models_dir / model.dir
    if is_present(model, models_dir):
        return target
    models_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=models_dir, prefix=".fetch-") as tmp:
        scratch = Path(tmp)
        unpacked = scratch / "unpacked" / model.dir
        if model.archive:
            (pin,) = model.files
            archive = scratch / pin.file_name
            _download(pin, archive)
            with tarfile.open(archive) as tar:
                tar.extractall(scratch / "unpacked", filter="data")
            if not unpacked.is_dir():
                raise EngineError(
                    "model_missing",
                    f"{pin.file_name} holds no folder {model.dir}",
                )
        else:
            unpacked.mkdir(parents=True)
            for pin in model.files:
                _download(pin, unpacked / pin.file_name)
        (unpacked / MARKER).write_text(_format_marker(model), encoding="utf-8")
        if target.exists():
            target.rename(scratch / "old")
        unpacked.rename(target)
    return target


def _download(pin: Pin, path: Path) -> None:
    """Write the file at ``pin.url`` to ``path`` and check its SHA-256."""
    print(f"scrb-engine: downloading {pin.file_name}", file=sys.stderr)
    digest = hashlib.sha256()
    try:
        with (
            urllib.request.urlopen(pin.url) as response,
            path.open("wb") as file,
        ):
            while chunk := response.read(1 << 20):
                digest.update(chunk)
                file.write(chunk)
    except OSError as error:
        raise EngineError("model_missing", f"{pin.url}: {error}") from error
    if digest.hexdigest() != pin.sha256:
        raise EngineError(
            "model_missing",
            f"{pin.file_name} has SHA-256 {digest.hexdigest()}, "
            f"not the pinned {pin.sha256}",
        )


def _format_marker(model: Model) -> str:
    """Return the marker's lines, ``<sha256>  <file name>`` for each pin."""
    return "".join(f"{pin.sha256}  {pin.file_name}\n" for pin in model.files)
