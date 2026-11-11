"""Test encoding decisions and audio-position metadata without audio operations."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("timing", Path(__file__).with_name("bookmark-timing.py"))
timing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timing)


def make_probe(encoding, voice, **changes):
    """Create a synthetic probe decision, not synthesized speech."""
    return {"encoding": encoding, "voice": voice, "passed": True,
            "position_non_decreasing": True, "expected": 32, "received": 32, **changes}


class TestEncodingSelection(unittest.TestCase):
    """Reject superficially complete probes before any full source generation."""

    def test_prefers_a_then_c_then_b(self):
        """Select the documented preference independently of report order.

        A successful fallback must not displace a preferred passing encoding.
        """
        rows = [make_probe(encoding, voice) for encoding in ("B", "C", "A") for voice in ("David", "Zira")]
        self.assertEqual(timing.select_encoding(rows, ["David", "Zira"]), "A")
        rows = [row for row in rows if row["encoding"] != "A"]
        self.assertEqual(timing.select_encoding(rows, ["David", "Zira"]), "C")
        rows = [row for row in rows if row["encoding"] != "C"]
        self.assertEqual(timing.select_encoding(rows, ["David", "Zira"]), "B")

    def test_requires_both_voices(self):
        """Require evidence for each source voice.

        One engine voice succeeding cannot establish the other voice's timing.
        """
        with self.assertRaisesRegex(ValueError, "No bookmark"):
            timing.select_encoding([make_probe("A", "David")], ["David", "Zira"])

    def test_rejects_counts_and_nonmonotonic_positions(self):
        """Reject count mismatches and decreasing audio positions.

        Callback arrival counts alone cannot validate the source timeline.
        """
        for change in ({"received": 17}, {"position_non_decreasing": False}, {"passed": False}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                timing.select_encoding([make_probe("A", "David", **change)], ["David"])

    def test_ignores_wall_clock_arrival(self):
        """Validate audio positions rather than callback wall-clock timing.

        File synthesis can deliver all callbacks within a few milliseconds.
        """
        marks = [{"name": "s0", "seconds": 0.1}, {"name": "e0", "seconds": 0.5}]
        self.assertEqual(timing.validate_marks(marks, ["s0", "e0"], 1), (True, True))
        marks[1]["seconds"] = 0
        self.assertEqual(timing.validate_marks(marks, ["s0", "e0"], 1), (False, False))

    def test_rejects_missing_intermediate_end_marks(self):
        """Keep the observed seventeen-of-thirty-two failure uncredited.

        Ordered starts and a final end cannot stand in for missing endpoints.
        """
        names = [f"s{i}" for i in range(16)]+["e15"]
        marks = [{"name": name, "seconds": index/10} for index, name in enumerate(names)]
        expected = [name for index in range(16) for name in (f"s{index}", f"e{index}")]
        self.assertEqual(timing.validate_marks(marks, expected, 2), (False, True))


if __name__ == "__main__":
    unittest.main()
