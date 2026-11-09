"""Check source placement using timing metadata only, without audio I/O."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("sources", Path(__file__).with_name("assemble-sources.py"))
sources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sources)


def make_clips(track, long_seconds=7):
    """Provide invented intervals that need no speech engine or waveform."""
    return [{"id": f"{track}-{kind}-{index}", "kind": kind, "duration": duration,
             "words": [{"text": f"{track}{kind}{index}", "start": 0, "end": duration}]}
            for kind, count, duration in [("long", 3, long_seconds), ("short", 20, 0.6)]
            for index in range(count)]


class TestSourceCoverage(unittest.TestCase):
    """Keep a valid source denominator from depending on app output or silent tails."""

    def test_covers_full_failure_window(self):
        """Fit complete units through the end of the failure interval.

        Breaking when the next clip does not fit used to leave several seconds silent.
        """
        tracks = [sources.place_units(track, make_clips(track)) for track in ("microphone", "meeting")]
        for units in tracks:
            report = sources.assert_track_coverage(units)
            self.assertLess(report["failure_window_max_word_gap_seconds"], 0.5)
            self.assertTrue(any(unit["start"] < 214 and unit["end"] > 203 for unit in units))
        self.assertGreaterEqual(sources.assert_joint_coverage(tracks), 180)

    def test_rejects_half_second_gap(self):
        """Reject the threshold itself instead of allowing an inclusive half second.

        The protocol requires strictly less than half a second of silence.
        """
        units = sources.place_units("microphone", make_clips("microphone"))
        tail = [unit for unit in units if 170 <= unit["start"] and unit["end"] <= 245][-1]
        tail["words"][-1]["end"] = 244.5
        with self.assertRaisesRegex(AssertionError, "Failure-window"):
            sources.assert_track_coverage(units)

    def test_checks_inter_word_gaps_for_all_encodings(self):
        """Reject hidden word gaps regardless of how a phrase was rendered.

        Phrase envelopes cannot hide silence introduced by separate word synthesis.
        """
        for encoding in ("A", "B", "C"):
            with self.subTest(encoding=encoding):
                units = sources.place_units("microphone", make_clips("microphone"))
                unit = next(unit for unit in units if not unit["short"] and 170 <= unit["start"] <= 230)
                start, end = unit["start"], unit["end"]
                unit["encoding"] = encoding
                unit["words"] = [{"text": "alpha", "start": start, "end": start+1},
                                 {"text": "beta", "start": start+1.5, "end": end}]
                with self.assertRaisesRegex(AssertionError, "Failure-window"):
                    sources.assert_track_coverage(units)

    def test_checks_gap_across_window_edges(self):
        """Apply the outside-window gap rule to gaps that straddle 170 s or 245 s.

        Units placed at 170.25 or 244.75 used to escape a comparison against the nominal edge.
        """
        for track in ("microphone", "meeting"):
            with self.subTest(track=track):
                units = sources.place_units(track, make_clips(track))
                first = next(unit for unit in units if unit["start"] >= 170)
                shift = 2.9-(first["start"]-units[units.index(first)-1]["end"])
                first["start"] += shift
                first["end"] += shift
                for word in first["words"]:
                    word["start"] += shift
                    word["end"] += shift
                with self.assertRaisesRegex(AssertionError, "Outside-window gap"):
                    sources.assert_track_coverage(units)

    def test_includes_leading_and_trailing_gaps(self):
        """Measure silence against both edges of the required window.

        Inter-utterance checks alone cannot detect a silent tail or lead-in.
        """
        self.assertEqual(sources.measure_window_gap([(171, 244)], 170, 245), 1)

    def test_supports_protocol_long_duration_range(self):
        """Keep valid coverage across the permitted long-utterance durations.

        A fixed alternating pattern cannot fit eight short units with the longest clips.
        """
        for duration in (4, 6.5, 12):
            with self.subTest(duration=duration):
                tracks = [sources.place_units(track, make_clips(track, duration)) for track in ("microphone", "meeting")]
                for units in tracks:
                    sources.assert_track_coverage(units)
                sources.assert_joint_coverage(tracks)

    def test_rejects_short_word_repeat(self):
        """Reject repeated short words even if every duration fits.

        Frequent repeats can create ambiguous occurrence matching later.
        """
        units = sources.place_units("microphone", make_clips("microphone"))
        short = [unit for unit in units if unit["short"]]
        short[1]["words"][0]["text"] = short[0]["words"][0]["text"]
        with self.assertRaisesRegex(AssertionError, "repeats"):
            sources.assert_track_coverage(units)

    def test_rejects_shared_vocabulary(self):
        """Reject cross-track vocabulary contamination.

        Distinct reference words are a second guard beyond UI labels.
        """
        units = sources.place_units("microphone", make_clips("microphone"))
        with self.assertRaisesRegex(AssertionError, "disjoint"):
            sources.assert_joint_coverage([units, copy.deepcopy(units)])


if __name__ == "__main__":
    unittest.main()
