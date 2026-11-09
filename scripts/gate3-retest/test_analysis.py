"""Verify acceptance boundary behavior before any real diagnostic retest."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("bounds", Path(__file__).with_name("analyze-bounds.py"))
bounds = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bounds)


def make_unit(**changes):
    """Create an invented adjudicated endpoint near the failure window."""
    return {"id": "invented", "eligible": True, "start": 203, "last_word_start": 204,
            "last_word_end": 205, "outcome": "MATCHED", "identity_confirmed": True,
            "endpoints": [{"observed": 207, "u": 0.1}], **changes}


class TestAcceptanceBounds(unittest.TestCase):
    """Protect distinctions that previously produced unjustified publication credit."""

    def test_rejects_pre_speech(self):
        """Reject credit before a last word starts.

        Earlier words cannot establish publication of later reference speech.
        """
        with self.assertRaisesRegex(AssertionError, "PRE-SPEECH"):
            bounds.analyze_unit(make_unit(endpoints=[{"observed": 203.9, "u": 0.1}]))

    def test_keeps_negative_latency(self):
        """Retain visibility during the endpoint word.

        Clamping would discard a valid early publication observation.
        """
        self.assertEqual(bounds.analyze_unit(make_unit(endpoints=[{"observed": 204.5, "u": 0.1}]))["conservative"], -0.5)

    def test_keeps_unidentified_in_denominator(self):
        """Leave unidentified output uncredited in both bounds.

        Output identity uncertainty cannot improve the best-case result.
        """
        result = bounds.summarize_track([make_unit(outcome="UNIDENTIFIED")])
        self.assertEqual(result["latency"], "FAIL")
        self.assertEqual(result["bounds"]["best"]["within6"], 0)

    def test_straddle_is_inconclusive(self):
        """Treat polling across six seconds conservatively.

        An observation interval crossing the limit cannot prove recurrence.
        """
        result = bounds.summarize_track([make_unit(endpoints=[{"observed": 211.05, "u": 0.1}])] + [make_unit() for _ in range(18)])
        self.assertEqual(result["latency"], "INCONCLUSIVE")
        self.assertEqual(result["recurrence"], "INDETERMINATE")

    def test_requires_substitution_identity(self):
        """Require independent identity before crediting a substituted endpoint.

        A single-word guess has no independent matching evidence.
        """
        with self.assertRaises(AssertionError):
            bounds.analyze_unit(make_unit(outcome="MATCHED-SUBSTITUTED", reference_word_count=1,
                                         other_words_exact_fraction=1, identity_unique=True))

    def test_rejects_marker_disagreement(self):
        """Reject markers with excessive clock offset change.

        A two-point affine fit alone would always have zero residual.
        """
        self.assertFalse(bounds.fit_clock(1, 381, 11, 391.2)["valid"])


if __name__ == "__main__":
    unittest.main()
