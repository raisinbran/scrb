"""The catalog in ``models.toml`` and fetching a model's pinned files."""

import hashlib
import tarfile
import tomllib
from pathlib import Path

import pytest

from scrb_engine import EngineError
from scrb_engine.models import CATALOG_PATH, Model, Pin, fetch, is_present


def make_archive(tmp_path: Path) -> tuple[Path, str]:
    """Return a tar.gz holding ``weights/model.bin``, and its SHA-256."""
    source = tmp_path / "source" / "weights"
    source.mkdir(parents=True)
    (source / "model.bin").write_bytes(b"weights")
    archive = tmp_path / "weights.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(source, arcname="weights")
    return archive, hashlib.sha256(archive.read_bytes()).hexdigest()


def archive_model(archive: Path, sha256: str) -> Model:
    """Return a model whose one pinned file is ``archive``."""
    pin = Pin(archive.as_uri(), sha256)
    return Model(
        name="weights",
        kind="asr",
        runtime="stub",
        dir="weights",
        archive=True,
        files=(pin,),
    )


def test_models_toml_extras_exist_in_pyproject():
    """Each model's ``extra`` is an extra of the engine's ``pyproject.toml``.

    scrb passes it to ``uv sync --extra``, and uv accepts an unknown extra
    without an error, so a wrong name would leave the model's packages
    missing.
    """
    with (CATALOG_PATH.parent / "pyproject.toml").open("rb") as file:
        extras = tomllib.load(file)["project"]["optional-dependencies"]
    with CATALOG_PATH.open("rb") as file:
        models = tomllib.load(file)["models"]

    named = {name: entry.get("extra") for name, entry in models.items()}

    assert {extra for extra in named.values() if extra} == set(extras)
    assert named["silero-vad"] is None


def test_fetch_refuses_archive_with_wrong_hash(tmp_path):
    """A file whose SHA-256 differs from its pin is refused and left out.

    The pin is what makes a download trustworthy, so a mismatch must raise
    ``model_missing`` and leave nothing in the models folder.
    """
    archive, _ = make_archive(tmp_path)
    model = archive_model(archive, "0" * 64)
    models_dir = tmp_path / "models"

    with pytest.raises(EngineError) as raised:
        fetch(model, models_dir)

    assert raised.value.code == "model_missing"
    assert not is_present(model, models_dir)
    assert list(models_dir.iterdir()) == []


def test_fetch_discards_earlier_files_on_mismatch(tmp_path):
    """A model of loose files gets no folder when a later file mismatches.

    Whisper and Granite are fetched file by file, so a file already written
    must not reach the model's folder, or a partial model could load.
    """
    good = tmp_path / "config.json"
    good.write_bytes(b"{}")
    bad = tmp_path / "model.bin"
    bad.write_bytes(b"weights")
    model = Model(
        name="weights",
        kind="asr",
        runtime="stub",
        dir="weights",
        files=(
            Pin(good.as_uri(), hashlib.sha256(b"{}").hexdigest()),
            Pin(bad.as_uri(), "0" * 64),
        ),
    )
    models_dir = tmp_path / "models"

    with pytest.raises(EngineError) as raised:
        fetch(model, models_dir)

    assert raised.value.code == "model_missing"
    assert not is_present(model, models_dir)
    assert list(models_dir.iterdir()) == []


def test_fetch_unpacks_archive_and_marks_present(tmp_path):
    """A matching archive is unpacked into the model's folder.

    ``load`` and ``hello`` trust the marker, so the folder must hold the
    archive's files and read as present after the fetch.
    """
    archive, sha256 = make_archive(tmp_path)
    model = archive_model(archive, sha256)
    models_dir = tmp_path / "models"

    path = fetch(model, models_dir)

    assert path == models_dir / "weights"
    assert (path / "model.bin").read_bytes() == b"weights"
    assert is_present(model, models_dir)
