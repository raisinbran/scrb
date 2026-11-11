"""Verify current-protocol clock gating at the bounds CLI."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from test_analysis import make_unit

spec = importlib.util.spec_from_file_location('bounds', Path(__file__).with_name('analyze-bounds.py'))
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)


def run_bounds(clock):
    """Run two invented passing tracks with optional independently supplied clock reports."""
    data = {'frozen': True, 'units': [make_unit(track=track) for track in ('microphone', 'meeting')]}
    if clock is not None:
        data['clocks'] = {track: dict(clock) for track in ('microphone', 'meeting')}
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root/'input.json').write_text(json.dumps(data), encoding='utf-8')
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('analyze-bounds.py')),
                                 str(root/'input.json'), str(root/'output.json')],
                                capture_output=True, text=True, check=False)
        if result.returncode:
            raise AssertionError(result.stderr)
        return json.loads((root/'output.json').read_text(encoding='utf-8'))


class TestClockEnforcement(unittest.TestCase):
    """Prevent arithmetic acceptance from bypassing failed synchronization."""

    def test_invalid_clock_cannot_emit_layer_a_pass(self):
        """Make a disagreeing clock inconclusive despite otherwise timely endpoints.

        The existing 100 ms rule must be enforced by the public scorer entry point.
        """
        clock = bounds.fit_clock(4.695, 384.905, 101, 481)
        self.assertFalse(clock['valid'])
        result = run_bounds(clock)
        for track in ('microphone', 'meeting'):
            self.assertEqual(result[track]['latency'], 'INCONCLUSIVE')
            self.assertIsNone(result[track]['bounds'])

    def test_missing_clock_cannot_emit_layer_a_pass(self):
        """Keep absent marker evidence inconclusive rather than assuming clock agreement.

        Missing synchronization cannot silently become a valid scored result.
        """
        result = run_bounds(None)
        for track in ('microphone', 'meeting'):
            self.assertEqual(result[track]['latency'], 'INCONCLUSIVE')


    def test_claimed_valid_flag_cannot_override_disagreement(self):
        """Recheck the measured disagreement instead of trusting a claimed valid flag.

        A stale flag cannot waive the current 100 ms rule.
        """
        clock = {**bounds.fit_clock(1, 381, 101, 481), 'offset_disagreement_seconds': 0.2}
        result = run_bounds(clock)
        self.assertEqual(result['microphone']['latency'], 'INCONCLUSIVE')

    def test_uncertainty_and_track_scope(self):
        """Keep per-track validity and measured anchor uncertainty in the current rule.

        An otherwise valid fit can still exceed the rule when uncertainty is included.
        """
        clock = {**bounds.fit_clock(1, 381, 101, 481),
                 'offset_disagreement_seconds': 0.09, 'anchor_uncertainty_s': [0.01, 0.01]}
        result = run_bounds(clock)
        self.assertEqual(result['meeting']['latency'], 'INCONCLUSIVE')
        self.assertEqual(result['meeting']['denominator'], 1)
        valid = bounds.fit_clock(1, 381, 101, 481)
        self.assertEqual(bounds.analyze_track([make_unit()], valid)['latency'], 'PASS')
        self.assertEqual(bounds.analyze_track([make_unit(endpoints=[{'observed': 220, 'u': 0.1}])], valid)['latency'], 'FAIL')
        self.assertEqual(bounds.analyze_track([make_unit()], clock)['latency'], 'INCONCLUSIVE')


    def test_valid_clock_keeps_current_scoring(self):
        """Retain existing endpoint arithmetic when the current clock rule passes.

        Clock gating must not alter the latency targets or frozen denominator.
        """
        result = run_bounds(bounds.fit_clock(1, 381, 101, 481))
        self.assertEqual(result['microphone']['latency'], 'PASS')
        self.assertEqual(result['meeting']['latency'], 'PASS')


if __name__ == '__main__':
    unittest.main()
