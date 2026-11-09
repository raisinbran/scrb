"""Reproduce the independent review findings with invented inputs only."""
import array
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from marker_clock import analyze_recording, fit_markers
from occurrence_matcher import align_occurrences
from test_marker_clock import make_audio
from test_occurrence_matcher import make_annotations, make_publications
import wave


def make_clock():
    """Build a synthetic identity-bound fit for CLI regression checks."""
    return {**fit_markers({"position": 1, "uncertainty_s": 0.005},
                         {"position": 381, "uncertainty_s": 0.005}, (1, 381)),
            "track": "meeting", "recording_sha256": "a"*64}


def run_matcher(publications, clock=None):
    """Run the public matcher entry point with temporary invented JSON files."""
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        (root/"annotations.json").write_text(json.dumps(make_annotations(1)))
        (root/"publications.json").write_text(json.dumps(publications))
        command = [sys.executable, str(Path(__file__).with_name("occurrence_matcher.py")),
                   str(root/"annotations.json"), str(root/"publications.json"),
                   str(root/"output.json"), "--track", "meeting"]
        if clock is not None:
            (root/"clock.json").write_text(json.dumps(clock))
            command.extend(["--clock", str(root/"clock.json")])
        return subprocess.run(command, capture_output=True, text=True, check=False)


def write_recording(path, rate, stereo=False):
    """Write two existing marker patterns into a synthetic PCM16 recording."""
    samples = array.array("h", [0])*(390*rate)
    fragment = make_audio((1,), rate=rate)
    for origin in (1, 381):
        samples[origin*rate:(origin+2)*rate] = fragment[rate:3*rate]
    if stereo:
        channels = array.array("h", [0])*(2*len(samples))
        channels[1::2] = samples
        samples = channels
    if sys.byteorder != "little":
        samples.byteswap()
    with wave.open(str(path), "wb") as stream:
        stream.setparams((2 if stereo else 1, 2, rate, 0, "NONE", "not compressed"))
        stream.writeframes(samples.tobytes())


class TestReviewFixes(unittest.TestCase):
    """Require conservative identity and explicit recording-clock provenance."""

    def test_broad_provenance_cannot_confirm_repeats(self):
        """Reject exact credit from source spans shared by both repeated occurrences.

        A missed first sentence and a duplicated second sentence must not look complete.
        """
        annotations = make_annotations(2)
        pubs = make_publications(annotations, skip=(0,))
        pubs += [{**pub, "id": "duplicate-"+pub["id"], "observed": 35} for pub in pubs]
        for pub in pubs:
            pub.update(audio_start=20, audio_end=33)
        rows = align_occurrences(annotations, pubs, "meeting", clock_basis="recording")
        self.assertEqual([row["outcome"] for row in rows], ["UNIDENTIFIED", "UNIDENTIFIED"])
        self.assertTrue(all(not row["identity_confirmed"] and not row["identity_unique"] for row in rows))
        credited = [point["publication_id"] for row in rows if row["outcome"] == "MATCHED"
                    for point in row["endpoints"]]
        self.assertEqual(credited, [])

    def test_clock_track_mismatch_rejected(self):
        """Reject a fit from the other track at the matcher CLI.

        A valid affine transform cannot establish the selected track's clock identity.
        """
        clock = {**make_clock(), "track": "microphone"}
        result = run_matcher({"words": make_publications(make_annotations(1)),
                              "clock_basis": "harness", "recording_sha256": "a"*64}, clock)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("track", result.stderr.lower())

    def test_clock_recording_mismatch_rejected(self):
        """Reject a same-track fit from a different preserved recording.

        Binding only the track would still allow an unrelated session's offset.
        """
        result = run_matcher({"words": make_publications(make_annotations(1)),
                              "clock_basis": "harness", "recording_sha256": "b"*64}, make_clock())
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("recording", result.stderr.lower())

    def test_omitted_clock_basis_rejected(self):
        """Require an explicit basis even when timestamps look plausible.

        Missing metadata must not silently mean recording time.
        """
        result = run_matcher({"words": make_publications(make_annotations(1))})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("basis", result.stderr.lower())

    def test_harness_basis_requires_fit(self):
        """Reject harness timestamps when no validated marker fit is supplied.

        Otherwise an arbitrary harness offset would change latency and window scoring.
        """
        result = run_matcher({"words": make_publications(make_annotations(1)),
                              "clock_basis": "harness", "recording_sha256": "a"*64})
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("clock", result.stderr.lower())

    def test_recording_basis_explicitly_accepted(self):
        """Accept explicitly declared recording-clock publications without conversion.

        The scored and recurrence windows must stay in the original recording clock.
        """
        result = run_matcher({"words": make_publications(make_annotations(1)),
                              "clock_basis": "recording", "recording_sha256": "a"*64})
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_invalid_fit_rejected(self):
        """Reject invalid fits even when track and recording identity agree.

        Explicit clock metadata cannot replace successful synchronization.
        """
        result = run_matcher({"words": make_publications(make_annotations(1)),
                              "clock_basis": "harness", "recording_sha256": "a"*64},
                             {**make_clock(), "valid": False})
        self.assertNotEqual(result.returncode, 0)

    def test_pcm16_rates_and_stereo(self):
        """Detect markers at 16 and 24 kHz on the explicitly selected stereo channel.

        A silent channel must fail instead of borrowing another channel's marker.
        """
        for rate in (16000, 24000):
            with self.subTest(rate=rate), tempfile.TemporaryDirectory() as directory:
                path = Path(directory)/"synthetic-stereo.wav"
                write_recording(path, rate, stereo=True)
                result = analyze_recording(path, "microphone", (11, 391), channel=1)
                self.assertTrue(result["valid"], result)
                self.assertFalse(analyze_recording(path, "microphone", (11, 391), channel=0)["valid"])

    def test_report_contains_recording_identity(self):
        """Include track, recording digest, rate, and channel in a detected-clock report.

        Consumers need to bind the fit to the actual preserved recording and track.
        """
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"synthetic.wav"
            write_recording(path, 16000)
            result = analyze_recording(path, "microphone", (11, 391))
            self.assertEqual(result.get("track"), "microphone")
            self.assertEqual(result.get("recording_sha256"), hashlib.sha256(path.read_bytes()).hexdigest())
            self.assertEqual(result.get("sample_rate"), 16000)
            self.assertEqual(result.get("channel"), 0)

    def test_invalid_harness_is_inconclusive(self):
        """Return an explicit failure report for invalid harness anchors.

        Invalid synchronization must follow the same report path as missing tones.
        """
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"synthetic.wav"
            write_recording(path, 16000)
            for harness, uncertainty in (((11, 10), (0, 0)), ((11, float("nan")), (0, 0)),
                                         ((11, 391), (-0.1, 0))):
                with self.subTest(harness=harness, uncertainty=uncertainty):
                    result = analyze_recording(path, "microphone", harness, harness_u=uncertainty)
                    self.assertFalse(result["valid"])
                    self.assertEqual(result["latency"], "INCONCLUSIVE")
                    self.assertIn("anchor", result["error"].lower())


if __name__ == "__main__":
    unittest.main()
