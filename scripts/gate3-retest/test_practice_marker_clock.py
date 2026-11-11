"""Cover practice-like marker shapes and drift with invented PCM only."""
import array
import math
import unittest

from marker_clock import detect_marker, fit_markers


def make_practice_audio(frequency, lead, trail, amplitude, durations):
    """Build 48 kHz mono tones with independently placed marker pulse onsets."""
    rate = 48000
    samples = array.array('h', [0])*(390*rate)
    for origin in (lead, trail):
        for pulse, duration in enumerate(durations):
            start = round((origin+pulse*0.5)*rate)
            for i in range(round(duration*rate)):
                samples[start+i] = round(amplitude*math.sin(2*math.pi*frequency*i/rate))
    return samples


class TestPracticeMarkerClock(unittest.TestCase):
    """Preserve detection while rejecting excessive common offset change."""

    def test_rejects_practice_scale_offset_change(self):
        """Reject 200 ms scale drift even when affine anchor residuals are zero.

        Two anchors always fit exactly and cannot waive the unchanged 100 ms rule.
        """
        for frequency, delay in ((880, 0.205), (1320, 0.200)):
            with self.subTest(frequency=frequency):
                samples = make_practice_audio(frequency, 4.69, 384.69+delay, 8000,
                                              (0.195, 0.195, 0.200))
                lead = detect_marker(samples, 48000, frequency, (0, 10))
                trail = detect_marker(samples, 48000, frequency, (380, 390))
                fit = fit_markers(lead, trail, (101, 481), (0.0012, 0.0012))
                self.assertFalse(fit['valid'])
                self.assertEqual(fit['latency'], 'INCONCLUSIVE')
                self.assertAlmostEqual(fit['offset_disagreement_seconds'], delay)
                for marker, expected in ((lead, 101), (trail, 481)):
                    self.assertAlmostEqual(fit['offset']+fit['slope']*marker['position'], expected)

    def test_preserves_route_delays_and_levels(self):
        """Find 195 ms pulses on two routes with different gains and onset offsets.

        Different captured levels and 40 to 45 ms route offsets must not be normalized away.
        """
        markers = {}
        for track, frequency, lead, trail, amplitude in (
                ('meeting', 1320, 4.65, 384.85, 11300),
                ('microphone', 880, 4.69, 384.895, 8000)):
            samples = make_practice_audio(frequency, lead, trail, amplitude,
                                          (0.195, 0.195, 0.195))
            markers[track] = [detect_marker(samples, 48000, frequency, window)
                              for window in ((0, 10), (380, 390))]
            for marker in markers[track]:
                self.assertEqual(len(marker['pulses']), 3)
                self.assertEqual(marker['uncertainty_s'], 0.005)
                for start, end in marker['pulses']:
                    self.assertAlmostEqual(end-start, 0.195)
        for index, expected in ((0, 0.040), (1, 0.045)):
            difference = markers['microphone'][index]['position']-markers['meeting'][index]['position']
            self.assertAlmostEqual(difference, expected)

    def test_detects_nonuniform_trailing_pulses(self):
        """Retain a valid pattern when the last onset advances by one detector frame.

        Opus-captured marker feature times can differ by 5 ms within a pattern.
        """
        rate = 48000
        samples = make_practice_audio(880, 4.695, 384.905, 8000, (0.200, 0.195, 0.200))
        old = round(385.905*rate)
        new = round(385.900*rate)
        count = round(0.2*rate)
        tone = samples[old:old+count]
        samples[old:old+count] = array.array('h', [0])*count
        samples[new:new+count] = tone
        marker = detect_marker(samples, rate, 880, (380, 390))
        self.assertEqual(marker['position'], 384.905)
        self.assertAlmostEqual(marker['pulses'][2][0]-marker['pulses'][1][0], 0.495)


if __name__ == '__main__':
    unittest.main()
