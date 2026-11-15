"""Safe work directory handling for gap-size-test.py."""
import os
import shutil

MARKER = '.gap-size-test-workdir'
MARKER_TEXT = 'gap-size-test.py work directory; safe to delete with --reset\n'


def _is_same_or_inside(inner, outer):
    return inner == outer or inner.startswith(outer.rstrip(os.sep) + os.sep)


def check_resettable(path, protected):
    """Return None if path may be deleted by --reset, else the reason it may not.

    It must be a real directory (not a link), carry the marker this script wrote,
    and be neither a protected path (root, home, repo root, current directory)
    nor a parent of one.
    """
    if not path or not path.strip():
        return 'empty path'
    if os.path.islink(path):
        return 'path is a symbolic link'
    real = os.path.realpath(path)
    if not os.path.isdir(real):
        return 'not an existing directory'
    for p in [os.sep, *protected]:
        pr = os.path.realpath(p)
        if _is_same_or_inside(pr, real):
            return f'{real} is or contains a protected path ({pr})'
    marker = os.path.join(real, MARKER)
    try:
        if open(marker).read() != MARKER_TEXT:
            return 'marker file has unexpected content'
    except OSError:
        return 'no marker file; this directory was not created by gap-size-test.py'
    return None


def reset(path, protected):
    reason = check_resettable(path, protected)
    if reason:
        raise SystemExit(f'refusing --reset on {path!r}: {reason}')
    shutil.rmtree(os.path.realpath(path))


def mark(path):
    with open(os.path.join(path, MARKER), 'w') as f:
        f.write(MARKER_TEXT)
