"""Verify sync detection using invented audio only."""
import array
import math
import unittest

from marker_clock import detect_marker, fit_markers, map_publications, analyze_recording
import tempfile
import wave
from pathlib import Path


def make_audio(origins=(1, 31), frequency=880, rate=8000, drift=1):
    """Build a short synthetic recording with the existing three-pulse pattern."""
    samples = array.array("h", [0])*int(40*rate)
    for origin in origins:
        for pulse in range(3):
            start = round((origin+pulse*0.5)*drift*rate)
            for i in range(round(0.2*drift*rate)):
                samples[start+i] = round(8000*math.sin(2*math.pi*frequency*i/rate))
    return samples


class TestMarkerClock(unittest.TestCase):
    """Reject missing or ambiguous synchronization rather than fitting guesses."""

    def test_offset_and_drift(self):
        """Recover known affine anchors within reported uncertainty.

        A two-point zero residual alone is not a clock quality check.
        """
        for frequency in (880, 1320):
            audio = make_audio(frequency=frequency, drift=1.001)
            lead = detect_marker(audio, 8000, frequency, (0, 10), (10, 30))
            trail = detect_marker(audio, 8000, frequency, (30, 40), (10, 30))
            result = fit_markers(lead, trail, (101, 131), (0.001, 0.001))
            self.assertTrue(result["valid"])
            self.assertLessEqual(result["offset_bounds"][0], 100)
            self.assertGreaterEqual(result["offset_bounds"][1], 100)
            self.assertLessEqual(result["slope_bounds"][0], 1/1.001)
            self.assertGreaterEqual(result["slope_bounds"][1], 1/1.001)

    def test_missing_marker(self):
        """Reject silence, wrong-frequency tone, and incomplete pulse patterns.

        None establishes the prescribed sync event.
        """
        for origins, frequency in (((), 880), ((1,), 1320)):
            with self.assertRaisesRegex(ValueError, "missing"):
                detect_marker(make_audio(origins, frequency), 8000, 880, (0, 10), (10, 30))
        audio = make_audio((1,))
        audio[16000:18000] = array.array("h", [0])*2000
        with self.assertRaisesRegex(ValueError, "missing"):
            detect_marker(audio, 8000, 880, (0, 10), (10, 30))

    def test_ambiguous_marker(self):
        """Reject two complete marker candidates in one search window.

        Picking a convenient pattern would fabricate a clock anchor.
        """
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            detect_marker(make_audio((1, 5)), 8000, 880, (0, 10), (10, 30))

    def test_scored_window(self):
        """Reject marker searches overlapping scored speech.

        Sync evidence must remain outside the scored interval.
        """
        with self.assertRaisesRegex(ValueError, "outside"):
            detect_marker(make_audio(), 8000, 880, (0, 11), (10, 30))

    def test_disagreement(self):
        """Reject excessive offset change including anchor uncertainty.

        An exact affine fit cannot excuse the protocol's 100 ms rule.
        """
        lead = {"position": 1, "uncertainty_s": 0.005}
        trail = {"position": 381, "uncertainty_s": 0.005}
        result = fit_markers(lead, trail, (11, 391.2))
        self.assertFalse(result["valid"])
        self.assertEqual(result["latency"], "INCONCLUSIVE")

    def test_recording_clock_mapping(self):
        """Keep publication bounds in the annotation clock after a large offset.

        Moving annotations would incorrectly move the fixed recurrence window.
        """
        clock = fit_markers({"position": 1, "uncertainty_s": 0.005},
                            {"position": 381, "uncertainty_s": 0.005}, (101, 481))
        clock.update(track="meeting", recording_sha256="a"*64)
        mapped = map_publications([{"observed": 307, "u": 0.1}], clock,
                                  track="meeting", recording_sha256="a"*64)[0]
        self.assertLessEqual(mapped["observed"]-mapped["u"], 206.9)
        self.assertGreaterEqual(mapped["observed"], 207)
        self.assertEqual(mapped["observed_nominal"], 207)
        with self.assertRaisesRegex(ValueError, "INCONCLUSIVE"):
            map_publications([], {**clock, "valid": False}, track="meeting", recording_sha256="a"*64)

    def test_pcm_recording_integration(self):
        """Detect both markers through the PCM16 file adapter.

        Missing trailing audio must yield an explicit inconclusive report.
        """
        rate = 8000
        samples = array.array("h", [0])*(390*rate)
        for origin in (1, 381):
            fragment = make_audio((1,), rate=rate)
            begin = origin*rate
            samples[begin:begin+2*rate] = fragment[rate:3*rate]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"invented.wav"
            with wave.open(str(path), "wb") as stream:
                stream.setparams((1, 2, rate, 0, "NONE", "not compressed"))
                stream.writeframes(samples.tobytes())
            self.assertTrue(analyze_recording(path, "microphone", (11, 391))["valid"])
            self.assertFalse(analyze_recording(path, "meeting", (11, 391))["valid"])


if __name__ == "__main__":
    unittest.main()
