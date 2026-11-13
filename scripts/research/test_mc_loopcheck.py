"""Regression for mc_loopcheck.new_repeats: python3 -I scripts/research/test_mc_loopcheck.py"""
import importlib.util
import os

here = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("lc", os.path.join(here, "mc_loopcheck.py"))
lc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lc)

a = "we need to go ".split() * 3
b = "one two three four ".split() * 3
filler = "x y z".split()
# different phrase, equal repeat count (3 vs 3): must be flagged
assert lc.new_repeats(a + filler, b + filler) == {"one two three four": 3}
# same phrase already repeated in the baseline: not new
assert lc.new_repeats(a + filler, a + filler) == {}
# baseline repeats it only twice, test three times: new
assert lc.new_repeats(("we need to go " * 2).split() + filler, a + filler) == {"we need to go": 3}
# fewer than 3 repeats, or phrases under 4 words: not flagged
assert lc.new_repeats(filler, ("we need to go " * 2).split()) == {} and lc.new_repeats(filler, ("go now " * 5).split()) == {}
print("mc_loopcheck tests OK")
