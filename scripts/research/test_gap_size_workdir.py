"""Regression for gap_size_workdir: python3 -I scripts/research/test_gap_size_workdir.py"""
import importlib.util
import os
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('wd', os.path.join(here, 'gap_size_workdir.py'))
wd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wd)

home = os.path.expanduser('~')
repo = os.path.abspath(os.path.join(here, '..', '..'))
protected = [home, repo, os.getcwd()]
# unsafe paths are refused
for bad in ['', '   ', '/', home, repo, os.getcwd(), os.path.dirname(repo), '/nonexistent-gap-dir']:
    assert wd.check_resettable(bad, protected), bad
with tempfile.TemporaryDirectory() as t:
    unmarked = os.path.join(t, 'unmarked')
    os.mkdir(unmarked)
    open(os.path.join(unmarked, 'keep.txt'), 'w').write('x')
    assert 'no marker' in wd.check_resettable(unmarked, protected)
    try:
        wd.reset(unmarked, protected)
        raise AssertionError('deleted an unmarked directory')
    except SystemExit:
        pass
    assert os.path.exists(os.path.join(unmarked, 'keep.txt'))
    # wrong marker content is refused
    open(os.path.join(unmarked, wd.MARKER), 'w').write('other')
    assert 'unexpected' in wd.check_resettable(unmarked, protected)
    # a marked directory is deleted
    ok = os.path.join(t, 'ok')
    os.mkdir(ok)
    wd.mark(ok)
    assert wd.check_resettable(ok, protected) is None
    wd.reset(ok, protected)
    assert not os.path.exists(ok)
    # a link to a marked directory is refused
    real = os.path.join(t, 'real')
    os.mkdir(real)
    wd.mark(real)
    link = os.path.join(t, 'link')
    os.symlink(real, link)
    assert 'symbolic' in wd.check_resettable(link, protected)
    # a marked directory that contains a protected path is refused
    outer = os.path.join(t, 'outer')
    inner = os.path.join(outer, 'inner')
    os.makedirs(inner)
    wd.mark(outer)
    assert 'protected' in wd.check_resettable(outer, protected + [inner])
print('ok')
