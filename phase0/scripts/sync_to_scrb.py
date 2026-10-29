"""Mirror the Phase 0 scratch repo into the scrb repo's phase0/ folder.

Usage: python -I sync_to_scrb.py <scratch_root> <scrb_root> [--dry-run]

Copies everything needed to continue Phase 0 on another machine and skips
what is re-downloadable or too large for GitHub (recorded in
phase0/MANIFEST.md instead): models, upstream clones, prebuilt tools,
downloads, build outputs, and WAV files over 10 MB.  Files deleted in the
scratch repo are not deleted from phase0/.
"""

import os
import shutil
import sys

SKIP_FILES = {".gitignore"}  # phase0/ keeps its own ignore rules for the fetched inputs
SKIP_DIRS = {".git", "downloads", "models", "tools", "upstream", "__pycache__", "results"}
SKIP_EXT = {".exe", ".obj", ".dll", ".lib", ".pdb", ".exp", ".gguf", ".onnx", ".bin", ".bz2", ".opus"}
MAX_WAV = 10 * 1024 * 1024
MAX_ANY = 50 * 1024 * 1024


def wanted(path, size):
    ext = os.path.splitext(path)[1].lower()
    if ext in SKIP_EXT:
        return False
    if ext == ".wav" and size > MAX_WAV:
        return False
    return size <= MAX_ANY


def main():
    src, dst_root = sys.argv[1], sys.argv[2]
    dry = "--dry-run" in sys.argv
    dst = os.path.join(dst_root, "phase0")
    copied = skipped = total = 0
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name in SKIP_FILES:
                continue
            path = os.path.join(root, name)
            size = os.path.getsize(path)
            rel = os.path.relpath(path, src)
            if not wanted(path, size):
                skipped += 1
                continue
            target = os.path.join(dst, rel)
            if os.path.exists(target) and os.path.getsize(target) == size and \
                    os.path.getmtime(target) >= os.path.getmtime(path):
                continue
            copied += 1
            total += size
            if not dry:
                os.makedirs(os.path.dirname(target), exist_ok=True)
                shutil.copy2(path, target)
    print(f"{'would copy' if dry else 'copied'} {copied} files, {total / 1e6:.1f} MB; skipped {skipped}")


if __name__ == "__main__":
    main()
