"""D3: harness marker derivation from the playback log and the frozen source (invented source, invented log)."""
import unittest

import harness_provenance as hp
from test_integration_e2e import BRACKET, FREQ, H0, SOURCE_RATE, harness_events, source_pcm


class Derivation(unittest.TestCase):
    def derive(self, track='microphone', events=None, source=None):
        source = source or source_pcm(hz={'microphone': 880, 'meeting': 1320}[track])
        return hp.derive_harness_markers(events or harness_events(), track, source[0], source[1])

    def test_microphone_and_meeting_use_their_own_start_event(self):
        events = harness_events()
        events[2]['data']['before']['qpc_ticks'] = BRACKET[0]-20000   # the meeting bracket is wider
        self.assertAlmostEqual(self.derive('microphone', events)['bracket_half_width_s'], .0005)
        self.assertAlmostEqual(self.derive('meeting', events)['bracket_half_width_s'], .0015)
        self.assertEqual(self.derive('meeting', events)['start_event'], 'system_start')

    def test_uncertainty_includes_the_bracket_width_and_the_source_detector_step(self):
        for u in self.derive()['harness_u']:
            self.assertAlmostEqual(u, .0005+.005)

    def test_invalid_logs_are_rejected(self):
        for name, edit in (('no devices', lambda e: e.pop(0)), ('no start', lambda e: e.pop(1)),
                           ('missing bracket', lambda e: e[1]['data'].clear()),
                           ('reversed bracket', lambda e: e[1]['data'].update(before={'qpc_ticks': BRACKET[1]}, after={'qpc_ticks': BRACKET[0]})),
                           ('bracket after the logged stamp', lambda e: e[1]['data'].update(after={'qpc_ticks': e[1]['stamp']['qpc_ticks']+1})),
                           ('float ticks', lambda e: e[1]['data'].update(before={'qpc_ticks': 1.5}))):
            with self.subTest(case=name):
                events = harness_events()
                edit(events)
                with self.assertRaises(ValueError):
                    self.derive(events=events)

    def test_a_source_without_the_trail_marker_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.derive(source=source_pcm(trail_at=300.0))


if __name__ == '__main__':
    unittest.main()
