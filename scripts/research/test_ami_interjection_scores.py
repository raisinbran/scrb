"""Regression for ami_interjection_scores: python -I scripts/research/test_ami_interjection_scores.py"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

here = os.path.dirname(os.path.abspath(__file__))
path = os.path.join(here, "ami_interjection_scores.py")
spec = importlib.util.spec_from_file_location("ais", path)
ais = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ais)


def segs(*rows):
    return [(s, e, k) for s, e, k in rows]


# 1. The documented invocation processes more than zero meetings: --list with no meeting ids and no hypotheses.
with tempfile.TemporaryDirectory() as tmp:
    seg = os.path.join(tmp, "seg")
    os.mkdir(seg)
    for spk, rows in (("A", [(0.0, 20.0)]), ("B", [(5.0, 5.8)])):
        body = "".join(f'<segment transcriber_start="{s}" transcriber_end="{e}"/>' for s, e in rows)
        with open(os.path.join(seg, f"M1.{spk}.segments.xml"), "w") as f:
            f.write(f"<x>{body}</x>")
    out = os.path.join(tmp, "out.json")
    subprocess.run(
        [sys.executable, "-I", path, seg, os.path.join(tmp, "nohyp"), "100", out, "--list"],
        check=True, capture_output=True,
    )
    result = json.load(open(out))
    assert list(result) == ["M1"], result
    assert result["M1"]["0.5-1 s|overlapped"]["count"] == 1, result

# 2. Overlap uses every surrounding speaker and real reference frames. A has a pause around B, C talks over B
#    and also surrounds it.
ref = segs((0.0, 4.0, "A"), (4.2, 8.0, "A"), (0.0, 20.0, "C"), (4.0, 4.4, "B"))
by = {i[2]: i for i in ais.interjections(ref)}
assert by["B"][3] == ["A", "C"], by["B"]
assert by["B"][4] is True
# A segment in a genuine pause of every other speaker is not overlapped.
ref = segs((0.0, 3.0, "A"), (3.5, 8.0, "A"), (3.1, 3.4, "B"))
assert [i[4] for i in ais.interjections(ref) if i[2] == "B"] == [False]
# No surrounding speaker, no interjection.
assert [i for i in ais.interjections(segs((0.0, 2.0, "A"), (30.0, 30.5, "B"))) if i[2] == "B"] == []

# 3. Correct fractions never exceed 1, with boundaries off the 10 ms grid (a 102 ms segment).
hyp_all = [{"A", "B"} for _ in range(40)]  # every frame carries B: the best case
items = [(0.003, 0.105, "B", ["A"], True), (0.2, 0.2005, "B", ["A"], True)]
table = ais.tabulate(items, {"B": "B"}, hyp_all)
for cell in table.values():
    assert cell["correct_seconds"] <= cell["seconds"] + 1e-9, cell
cell = table["<0.5 s|overlapped"]
assert cell["count"] == 2
assert abs(cell["seconds"] - 0.10) < 1e-9, cell  # 10 whole frames for the 102 ms segment, 0 for the 0.5 ms one
assert abs(cell["correct_seconds"] - 0.10) < 1e-9, cell
print("ok")
